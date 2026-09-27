import { QueryClient } from '@tanstack/react-query';
import { type ArcaApi, createArcaApi } from '../data/api/arcaApi.ts';
import type { AnswerDetail, Excerpt, Today } from '../data/api/models.ts';
import { createHttpTransport } from '../data/api/transport.ts';
import { queryKeys } from '../data/query/keys.ts';
import { type ManifestScope, StorageJournal } from '../data/storage/journal.ts';
import {
  AnswerWriteCoordinator,
  type Completion,
  EDIT_EXCERPT_PROFILE,
  type SyncEvent,
  TRANSPORT_MAX_MS,
} from '../domain/commands/answerWriteCoordinator.ts';
import { AnswerWriteStore } from '../domain/commands/answerWriteStore.ts';
import { DraftRepository } from '../domain/drafts/draftRepository.ts';
import { BoardingCoordinator } from '../domain/onboarding/boardingCoordinator.ts';
import { NicknameCoordinator } from '../domain/onboarding/nicknameCoordinator.ts';
import { SessionController, type SessionSummary } from '../domain/session/sessionController.ts';
import type { PlatformPort } from '../platform/ports.ts';
import { ArchiveChains } from './archive.ts';
import { type BootstrapState, runBootstrap, START_EXCERPT_PROFILE } from './bootstrap/bootstrap.ts';
import type { PastDraftEntry } from './pastDrafts.ts';

// Composition root (06 §3.3): assembled once per app start. React sees only the summaries below.

export interface AppSnapshot {
  bootstrap: BootstrapState;
  session: Pick<SessionSummary, 'ownerScope' | 'mode' | 'epoch' | 'generation'> | null;
}

export interface AppServices {
  platform: PlatformPort;
  api: ArcaApi;
  queryClient: QueryClient;
  session: SessionController;
  journal: StorageJournal;
  drafts: DraftRepository;
  writes: AnswerWriteCoordinator;
  /** Edit and single delete, one lock per answer (06 §4.3, §9.2). */
  answers: AnswerWriteCoordinator;
  /** F20 page chain, memory only (06 §6.3). */
  archive: ArchiveChains;
  boarding: BoardingCoordinator;
  nickname: NicknameCoordinator;
  /** Visit-bound F12 completion models (memory only). */
  completions: Map<string, Completion>;
  /** Opaque route ref → answer id, memory only, cleared on owner change. */
  answerRefs: Map<string, string>;
  draftRefs: Map<string, PastDraftEntry>;
  /** True once after F00 seeded today's read model (the first F10 entry skips a duplicate OP-005). */
  consumeTodaySeed(): boolean;
  getSnapshot(): AppSnapshot;
  subscribe(listener: () => void): () => void;
  /** Cold start or F90 reconnect; repeats the same latest judgement (04 IX-032). */
  start(): Promise<BootstrapState>;
  /** F03 left for F10: the boarding continuation is over and the safe root is today again. */
  finishBoarding(): void;
}

export interface AppServicesConfig {
  platform: PlatformPort;
  apiBase: string | undefined;
  fetch?: typeof fetch;
}

export function createAppServices(config: AppServicesConfig): AppServices {
  const { platform } = config;
  const transport = createHttpTransport({
    baseUrl: config.apiBase,
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });
  const api = createArcaApi(transport);
  // Memory-only cache, no persister; no background polling (06 §6.1–6.2).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: 5 * 60_000 } },
  });
  const session = new SessionController({ api, identity: platform.identity, clock: platform.clock });
  const journal = new StorageJournal(platform.storage, platform.clock);

  let snapshot: AppSnapshot = { bootstrap: { phase: 'starting' }, session: null };
  const listeners = new Set<() => void>();
  const publish = (next: AppSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const boarding = new BoardingCoordinator({ session, journal });
  const nickname = new NicknameCoordinator({
    session,
    api,
    journal,
    network: platform.network,
    area: () => currentArea,
    syncProfile: async () => {
      const owner = snapshot.session;
      if (!owner?.generation) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.passenger(owner.ownerScope, owner.generation) });
    },
  });

  let running: Promise<BootstrapState> | null = null;
  // F00 seeded today's read model; the first F10 entry uses it instead of a second OP-005.
  let todaySeeded = false;
  const currentTodayTarget = (): string | null => {
    const owner = snapshot.session;
    if (!owner?.generation) return null;
    const cached = queryClient.getQueryData<Today>(
      queryKeys.today(owner.ownerScope, owner.generation, START_EXCERPT_PROFILE),
    );
    return cached?.sema.dailySemaId ?? null;
  };
  // Device area confirmed by the last bootstrap; drafts and trackers live only inside it.
  let currentArea: ManifestScope | null = null;
  const drafts = new DraftRepository({ journal, clock: platform.clock, area: () => currentArea });
  const commandFence = () =>
    snapshot.session && currentArea
      ? { ownerScope: snapshot.session.ownerScope, generation: snapshot.session.generation }
      : null;
  const writes = new AnswerWriteCoordinator({
    session,
    api,
    store: new AnswerWriteStore({ journal, area: () => currentArea }),
    drafts,
    // Device clock clamped against going backwards; local expiry only, never server judgement (06 §7.4).
    now: () => drafts.now(),
    fence: commandFence,
    // Current resources are re-read after success; old caches never stand in for the result (06 §6.4).
    syncCurrentResources: async () => {
      const owner = snapshot.session;
      if (!owner?.generation) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.owner(owner.ownerScope) });
    },
  });
  const answers = new AnswerWriteCoordinator({
    session,
    api,
    store: new AnswerWriteStore({ journal, area: () => currentArea, namespace: 'answer' }),
    drafts,
    now: () => drafts.now(),
    fence: commandFence,
    syncCurrentResources: (event) => syncAnswer(event),
  });

  const archive = new ArchiveChains({
    session,
    api,
    scope: () =>
      snapshot.session?.mode === 'ACTIVE' && snapshot.session.generation && currentArea
        ? { ownerScope: snapshot.session.ownerScope, generation: snapshot.session.generation }
        : null,
  });

  /**
   * Terminal edit/delete sync (06 §6.4, §9.2 #4): only a detail/row still at the base revision is
   * patched; the rest is re-read. Counts are never computed; a delete drops the detail, the row, its
   * empty month heading (derived) and memory refs to it.
   */
  const syncAnswer = async (event: SyncEvent): Promise<void> => {
    const owner = snapshot.session;
    if (!owner?.generation) return;
    const { ownerScope, generation } = owner;
    // A late result of an older owner/generation never touches the current list (06 §4.2).
    const same = () => snapshot.session?.ownerScope === ownerScope && snapshot.session.generation === generation;
    const detailKey = queryKeys.answer(ownerScope, generation, event.answerId);
    const rereadToday = () =>
      queryClient.invalidateQueries({ queryKey: [...queryKeys.owner(ownerScope), generation, 'today'] });
    if (event.kind === 'updated') {
      const cached = queryClient.getQueryData<AnswerDetail>(detailKey);
      if (cached && cached.revision === event.baseRevision && event.content !== null) {
        queryClient.setQueryData<AnswerDetail>(detailKey, {
          ...cached,
          content: event.content,
          revision: event.revision,
          isEdited: true,
        });
      }
      // The row excerpt comes only from a server excerpt of exactly the new revision (06 §6.3).
      let excerpt: Excerpt | null = null;
      const ticketId = event.ticketId;
      if (ticketId) {
        const current = await session
          .run('ACTIVE', (auth) => api.getAnswerWriteResult(auth, ticketId, EDIT_EXCERPT_PROFILE, TRANSPORT_MAX_MS))
          .catch(() => null);
        if (
          current?.state === 'SUCCEEDED' &&
          current.presentation.state === 'AVAILABLE' &&
          current.presentation.excerpt.state === 'AVAILABLE' &&
          current.presentation.excerpt.value.sourceRevision === event.revision
        ) {
          excerpt = current.presentation.excerpt.value;
        }
      }
      if (!same()) return;
      archive.patchRow(event.answerId, event.baseRevision, { revision: event.revision, excerpt });
      void queryClient.invalidateQueries({ queryKey: detailKey });
      await rereadToday();
      return;
    }
    if (event.kind === 'deleted') {
      queryClient.removeQueries({ queryKey: detailKey });
      archive.removeRow(event.answerId);
      completions.delete(event.answerId);
      for (const [ref, id] of answerRefs) if (id === event.answerId) answerRefs.delete(ref);
      await rereadToday();
      return;
    }
    // Not applied / reconciled: the server copy is current; read the detail and list state again.
    archive.invalidate();
    await queryClient.invalidateQueries({ queryKey: detailKey });
  };

  const runStart = (reuse?: SessionSummary, handoff: 'boarded' | null = null): Promise<BootstrapState> => {
    running ??= (async () => {
      const previous = snapshot.bootstrap;
      publish({
        ...snapshot,
        bootstrap: previous.phase === 'failed' ? { ...previous, retry: 'running' } : { phase: 'starting' },
      });
      currentArea = null;
      const outcome = await runBootstrap(
        {
          session,
          journal,
          api,
          queryClient,
          network: platform.network,
          resumeCreation: () => boarding.resumeAsActive(),
        },
        reuse,
        handoff,
      );
      currentArea = outcome.area;
      const result = outcome.state;
      // Expiry sweep after the area is confirmed; it never delays routing (06 §5.3, §7.4, §8.6).
      if (outcome.area && result.phase === 'ready') {
        todaySeeded = true;
        queueMicrotask(() => {
          void (async () => {
            await drafts.purgeExpired().catch(() => undefined);
            await writes.expirePayloads().catch(() => undefined);
            await answers.expirePayloads().catch(() => undefined);
            // Other targets are checked in the background, two at a time; today's target is
            // recovered by the screen that shows it (06 §5.3 #7).
            await writes.recheckAll({ except: currentTodayTarget() }).catch(() => undefined);
            await answers.recheckAll().catch(() => undefined);
            // A nickname request left unresolved outside F03 is restored with its own key.
            if (result.target !== 'boarded') await nickname.resume().catch(() => undefined);
          })();
        });
      }
      const next: BootstrapState =
        result.phase === 'failed' && previous.phase === 'failed' ? { ...result, retry: 'failed' } : result;
      publish({ ...snapshot, bootstrap: next });
      return next;
    })().finally(() => {
      running = null;
    });
    return running;
  };

  const completions = new Map<string, Completion>();
  // history.state holds only a local opaque ref; the answer id stays in memory (06 §5.1).
  const answerRefs = new Map<string, string>();
  // Past-draft refs for F13 (identity and handed-over text in memory only).
  const draftRefs = new Map<string, PastDraftEntry>();

  session.subscribe((event) => {
    // A generation change under the same owner also abandons every run: a new save/close/recheck
    // must start fresh instead of joining a run the fence already rejects (06 §4.2).
    const generationChanged =
      event.kind === 'established' && !!snapshot.session && snapshot.session.generation !== event.summary.generation;
    if (generationChanged && !event.ownerChanged) {
      completions.clear();
      answerRefs.clear();
      draftRefs.clear();
      writes.reset();
      answers.reset();
      archive.reset();
    }
    if (event.kind === 'discarded' || event.ownerChanged) {
      currentArea = null;
      completions.clear();
      answerRefs.clear();
      draftRefs.clear();
      writes.reset();
      answers.reset();
      archive.reset();
    }
    const previousMode = snapshot.session?.mode;
    const wasReady = !running && snapshot.bootstrap.phase === 'ready';
    if (event.kind === 'discarded') {
      queryClient.clear();
      // Owner can no longer be confirmed: private screens close in the same render and F00 re-runs (06 §5.4).
      publish({ bootstrap: wasReady ? { phase: 'starting' } : snapshot.bootstrap, session: null });
      if (wasReady) queueMicrotask(() => void runStart());
      return;
    }
    // Owner/permission/generation change discards private memory (06 §5.4, MS-SES-004).
    if (event.ownerChanged) queryClient.clear();
    const { ownerScope, mode, epoch, generation } = event.summary;
    // Mid-visit owner/mode change: reconcile the local area and route again, reusing this session.
    const reconcile = wasReady && (event.ownerChanged || previousMode !== mode);
    publish({
      bootstrap: reconcile ? { phase: 'starting' } : snapshot.bootstrap,
      session: { ownerScope, mode, epoch, generation },
    });
    // OP-003 success: F03 reads the created profile from the new owner's cache (06 §6.1, §9.1 #3).
    const boarded = event.boarded && generation ? event.boarded : null;
    if (boarded && generation) queryClient.setQueryData(queryKeys.passenger(ownerScope, generation), boarded);
    if (reconcile) {
      const summary = event.summary;
      queueMicrotask(() => void runStart(summary, boarded ? 'boarded' : null));
    }
  });

  // Foreground: proactive session refresh, today re-query, one check per kept command. Background
  // stops result-check timers; neither direction decides any outcome (06 §5.4, §6.2, §8.5 #6).
  platform.lifecycle.onVisibilityChange((visible) => {
    if (!visible) {
      writes.suspend();
      answers.suspend();
      return;
    }
    writes.resume();
    answers.resume();
    const ready = snapshot.bootstrap.phase === 'ready' && snapshot.session?.mode === 'ACTIVE' && currentArea !== null;
    void (async () => {
      await session.refreshOnForeground().catch(() => undefined);
      if (!ready) return;
      const owner = snapshot.session;
      if (owner?.generation) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.today(owner.ownerScope, owner.generation, START_EXCERPT_PROFILE),
        });
      }
      await writes.recheckAll().catch(() => undefined);
      await answers.recheckAll().catch(() => undefined);
      await nickname.resume().catch(() => undefined);
    })();
  });

  return {
    platform,
    api,
    queryClient,
    session,
    journal,
    drafts,
    writes,
    answers,
    archive,
    boarding,
    nickname,
    completions,
    answerRefs,
    draftRefs,
    consumeTodaySeed() {
      const seeded = todaySeeded;
      todaySeeded = false;
      return seeded;
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => runStart(),
    finishBoarding() {
      const current = snapshot.bootstrap;
      if (current.phase === 'ready' && current.target === 'boarded') {
        publish({ ...snapshot, bootstrap: { ...current, target: 'today' } });
      }
    },
  };
}
