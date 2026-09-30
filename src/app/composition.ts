import { QueryClient } from '@tanstack/react-query';
import { createArcaApi } from '../data/api/arcaApi.ts';
import { createHttpTransport } from '../data/api/transport.ts';
import { queryKeys } from '../data/query/keys.ts';
import { StorageJournal } from '../data/storage/journal.ts';
import { AnalyticsQueue } from '../domain/analytics/analyticsQueue.ts';
import { ArchiveChains } from '../domain/archive/archiveChains.ts';
import { AnswerWriteCoordinator, type Completion } from '../domain/commands/answerWriteCoordinator.ts';
import { AnswerWriteStore } from '../domain/commands/answerWriteStore.ts';
import { AllDataDeleteCoordinator } from '../domain/deletion/allDataDeleteCoordinator.ts';
import { DraftRepository } from '../domain/drafts/draftRepository.ts';
import type { PastDraftEntry } from '../domain/drafts/pastDraftEntry.ts';
import type { Today } from '../domain/models.ts';
import { BoardingCoordinator } from '../domain/onboarding/boardingCoordinator.ts';
import { NicknameCoordinator } from '../domain/onboarding/nicknameCoordinator.ts';
import type { ArcaApi } from '../domain/ports/api.ts';
import type { PlatformPort } from '../domain/ports/platform.ts';
import type { JournalPort, ManifestScope } from '../domain/ports/storage.ts';
import { SessionController, type SessionSummary } from '../domain/session/sessionController.ts';
import { createAnswerSync } from './answerSync.ts';
import { type BootstrapState, runBootstrap, START_EXCERPT_PROFILE } from './bootstrap/bootstrap.ts';

export interface AppSnapshot {
  bootstrap: BootstrapState;
  session: Pick<SessionSummary, 'ownerScope' | 'mode' | 'epoch' | 'generation'> | null;
}

export interface AppServices {
  platform: PlatformPort;
  api: ArcaApi;
  queryClient: QueryClient;
  session: SessionController;
  journal: JournalPort;
  drafts: DraftRepository;
  writes: AnswerWriteCoordinator;
  answers: AnswerWriteCoordinator;
  archive: ArchiveChains;
  boarding: BoardingCoordinator;
  nickname: NicknameCoordinator;
  deletion: AllDataDeleteCoordinator;
  analytics: AnalyticsQueue;
  takeAllDeletedNotice(): boolean;
  completions: Map<string, Completion>;
  answerRefs: Map<string, string>;
  draftRefs: Map<string, PastDraftEntry>;
  consumeTodaySeed(): boolean;
  getSnapshot(): AppSnapshot;
  subscribe(listener: () => void): () => void;
  start(): Promise<BootstrapState>;
  finishBoarding(): void;
  leaveDeletion(): void;
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: 5 * 60_000 } },
  });
  const session = new SessionController({ api, identity: platform.identity, clock: platform.clock });
  const journal = new StorageJournal(platform.storage, platform.clock);
  const analytics = new AnalyticsQueue({ session, api, clock: platform.clock, appVersion: __APP_VERSION__ });

  let snapshot: AppSnapshot = { bootstrap: { phase: 'starting' }, session: null };
  const listeners = new Set<() => void>();
  const publish = (next: AppSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  let currentArea: ManifestScope | null = null;
  let deletionFenced = false;
  let allDeletedNotice = false;
  let todaySeeded = false;
  let running: Promise<BootstrapState> | null = null;

  const completions = new Map<string, Completion>();
  const answerRefs = new Map<string, string>();
  const draftRefs = new Map<string, PastDraftEntry>();

  const commandFence = () =>
    snapshot.session && currentArea
      ? { ownerScope: snapshot.session.ownerScope, generation: snapshot.session.generation }
      : null;

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
    deletionFenced: () => deletionFenced,
  });
  const drafts = new DraftRepository({ journal, clock: platform.clock, area: () => currentArea });
  const archive = new ArchiveChains({
    session,
    api,
    scope: () =>
      snapshot.session?.mode === 'ACTIVE' && snapshot.session.generation && currentArea
        ? { ownerScope: snapshot.session.ownerScope, generation: snapshot.session.generation }
        : null,
  });
  const writes = new AnswerWriteCoordinator({
    session,
    api,
    store: new AnswerWriteStore({ journal, area: () => currentArea }),
    drafts,
    now: () => drafts.now(),
    fence: commandFence,
    syncCurrentResources: async () => {
      const owner = snapshot.session;
      if (!owner?.generation) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.owner(owner.ownerScope) });
    },
    deletionFenced: () => deletionFenced,
  });
  const syncAnswer = createAnswerSync({
    session,
    api,
    queryClient,
    archive,
    currentOwner: () => snapshot.session,
    forgetAnswer: (answerId) => {
      completions.delete(answerId);
      for (const [ref, id] of answerRefs) if (id === answerId) answerRefs.delete(ref);
    },
  });
  const answers = new AnswerWriteCoordinator({
    session,
    api,
    store: new AnswerWriteStore({ journal, area: () => currentArea, namespace: 'answer' }),
    drafts,
    now: () => drafts.now(),
    fence: commandFence,
    syncCurrentResources: syncAnswer,
    deletionFenced: () => deletionFenced,
  });

  const resetVisitMemory = () => {
    completions.clear();
    answerRefs.clear();
    draftRefs.clear();
    writes.reset();
    answers.reset();
    archive.reset();
  };

  const recheckAllCommands = async () => {
    await writes.recheckAll().catch(() => undefined);
    await answers.recheckAll().catch(() => undefined);
    await nickname.resume().catch(() => undefined);
  };

  const deletion = new AllDataDeleteCoordinator({
    session,
    api,
    journal,
    network: platform.network,
    area: () => currentArea,
    hasUnresolvedCommands: async () =>
      (await writes.hasUnresolved()) || (await answers.hasUnresolved()) || (await nickname.hasUnresolved()),
    recheckCommands: async () => {
      deletionFenced = false;
      try {
        await writes.recheckAll();
        await answers.recheckAll();
        await nickname.resume();
      } finally {
        deletionFenced = true;
      }
    },
    setFence: (active) => {
      deletionFenced = active;
    },
    discardMemory: () => {
      analytics.discardAll();
      currentArea = null;
      queryClient.clear();
      resetVisitMemory();
    },
    finish: () => {
      allDeletedNotice = true;
      session.discard();
    },
    restart: () => {
      void runStart();
    },
  });

  const currentTodayTarget = (): string | null => {
    const owner = snapshot.session;
    if (!owner?.generation) return null;
    const cached = queryClient.getQueryData<Today>(
      queryKeys.today(owner.ownerScope, owner.generation, START_EXCERPT_PROFILE),
    );
    return cached?.sema.dailySemaId ?? null;
  };

  const runBackgroundRecovery = async (target: string) => {
    await drafts.purgeExpired().catch(() => undefined);
    await writes.expirePayloads().catch(() => undefined);
    await answers.expirePayloads().catch(() => undefined);
    await writes.recheckAll({ except: currentTodayTarget() }).catch(() => undefined);
    await answers.recheckAll().catch(() => undefined);
    if (target !== 'boarded') await nickname.resume().catch(() => undefined);
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
          hasPendingDeletion: (area) => deletion.hasPending(area),
        },
        reuse,
        handoff,
      );
      currentArea = outcome.area;
      const result = outcome.state;
      if (result.phase === 'ready' && result.target === 'deletion') deletionFenced = true;
      if (outcome.area && result.phase === 'ready' && result.target !== 'deletion') {
        todaySeeded = true;
        queueMicrotask(() => void runBackgroundRecovery(result.target));
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

  session.subscribe((event) => {
    const generationChanged =
      event.kind === 'established' && !!snapshot.session && snapshot.session.generation !== event.summary.generation;
    if (event.kind === 'discarded' || event.ownerChanged) {
      currentArea = null;
      resetVisitMemory();
    } else if (generationChanged) {
      resetVisitMemory();
    }

    const previousMode = snapshot.session?.mode;
    const wasReady = !running && snapshot.bootstrap.phase === 'ready';
    if (event.kind === 'discarded') {
      queryClient.clear();
      publish({ bootstrap: wasReady ? { phase: 'starting' } : snapshot.bootstrap, session: null });
      if (wasReady) queueMicrotask(() => void runStart());
      return;
    }
    if (event.ownerChanged) queryClient.clear();

    const { ownerScope, mode, epoch, generation } = event.summary;
    if (mode === 'DELETION_RECOVERY' && wasReady && !event.ownerChanged) {
      deletionFenced = true;
      const current = snapshot.bootstrap;
      publish({
        bootstrap: current.phase === 'ready' ? { ...current, target: 'deletion' } : current,
        session: { ownerScope, mode, epoch, generation },
      });
      return;
    }

    const reconcile = wasReady && (event.ownerChanged || previousMode !== mode);
    publish({
      bootstrap: reconcile ? { phase: 'starting' } : snapshot.bootstrap,
      session: { ownerScope, mode, epoch, generation },
    });
    const boarded = event.boarded && generation ? event.boarded : null;
    if (boarded && generation) queryClient.setQueryData(queryKeys.passenger(ownerScope, generation), boarded);
    if (reconcile) {
      const summary = event.summary;
      queueMicrotask(() => void runStart(summary, boarded ? 'boarded' : null));
    }
  });

  platform.network.onReconnect(() => analytics.hint());

  platform.lifecycle.onVisibilityChange((visible) => {
    analytics.hint();
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
      await recheckAllCommands();
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
    deletion,
    analytics,
    takeAllDeletedNotice() {
      const shown = allDeletedNotice;
      allDeletedNotice = false;
      return shown;
    },
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
    leaveDeletion() {
      const current = snapshot.bootstrap;
      if (current.phase === 'ready' && current.target === 'deletion' && snapshot.session?.mode === 'ACTIVE') {
        publish({ ...snapshot, bootstrap: { ...current, target: 'today' } });
      }
    },
    finishBoarding() {
      const current = snapshot.bootstrap;
      if (current.phase === 'ready' && current.target === 'boarded') {
        publish({ ...snapshot, bootstrap: { ...current, target: 'today' } });
      }
    },
  };
}
