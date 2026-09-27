import { QueryClient } from '@tanstack/react-query';
import { type ArcaApi, createArcaApi } from '../data/api/arcaApi.ts';
import { createHttpTransport } from '../data/api/transport.ts';
import { queryKeys } from '../data/query/keys.ts';
import { type ManifestScope, StorageJournal } from '../data/storage/journal.ts';
import { AnswerWriteCoordinator, type Completion } from '../domain/commands/answerWriteCoordinator.ts';
import { AnswerWriteStore } from '../domain/commands/answerWriteStore.ts';
import { DraftRepository } from '../domain/drafts/draftRepository.ts';
import { BoardingCoordinator } from '../domain/onboarding/boardingCoordinator.ts';
import { NicknameCoordinator } from '../domain/onboarding/nicknameCoordinator.ts';
import { SessionController, type SessionSummary } from '../domain/session/sessionController.ts';
import type { PlatformPort } from '../platform/ports.ts';
import { type BootstrapState, runBootstrap } from './bootstrap/bootstrap.ts';

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
  boarding: BoardingCoordinator;
  nickname: NicknameCoordinator;
  /** Visit-bound F12 completion models (memory only). */
  completions: Map<string, Completion>;
  /** Opaque route ref → answer id, memory only, cleared on owner change. */
  answerRefs: Map<string, string>;
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

  let running: Promise<BootstrapState> | null = null;
  // Device area confirmed by the last bootstrap; drafts and trackers live only inside it.
  let currentArea: ManifestScope | null = null;
  const drafts = new DraftRepository({ journal, clock: platform.clock, area: () => currentArea });
  const writes = new AnswerWriteCoordinator({
    session,
    api,
    store: new AnswerWriteStore({ journal, area: () => currentArea }),
    drafts,
    now: () => Date.now(),
    fence: () =>
      snapshot.session && currentArea
        ? { ownerScope: snapshot.session.ownerScope, generation: snapshot.session.generation }
        : null,
    // Current resources are re-read after success; old caches never stand in for the result (06 §6.4).
    syncAfterSuccess: async () => {
      const owner = snapshot.session;
      if (!owner?.generation) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.owner(owner.ownerScope) });
    },
  });

  const runStart = (reuse?: SessionSummary, handoff: 'boarded' | null = null): Promise<BootstrapState> => {
    running ??= (async () => {
      const previous = snapshot.bootstrap;
      publish({
        ...snapshot,
        bootstrap: previous.phase === 'failed' ? { ...previous, retry: 'running' } : { phase: 'starting' },
      });
      currentArea = null;
      const outcome = await runBootstrap(
        { session, journal, api, queryClient, network: platform.network },
        reuse,
        handoff,
      );
      currentArea = outcome.area;
      const result = outcome.state;
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

  session.subscribe((event) => {
    if (event.kind === 'discarded' || event.ownerChanged) {
      currentArea = null;
      completions.clear();
      answerRefs.clear();
      writes.reset();
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

  return {
    platform,
    api,
    queryClient,
    session,
    journal,
    drafts,
    writes,
    boarding: new BoardingCoordinator({ session, journal }),
    nickname: new NicknameCoordinator({
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
    }),
    completions,
    answerRefs,
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
