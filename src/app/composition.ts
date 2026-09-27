import { QueryClient } from '@tanstack/react-query';
import { type ArcaApi, createArcaApi } from '../data/api/arcaApi.ts';
import { createHttpTransport } from '../data/api/transport.ts';
import { StorageJournal } from '../data/storage/journal.ts';
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
  getSnapshot(): AppSnapshot;
  subscribe(listener: () => void): () => void;
  /** Cold start or F90 reconnect; repeats the same latest judgement (04 IX-032). */
  start(): Promise<BootstrapState>;
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

  const runStart = (reuse?: SessionSummary): Promise<BootstrapState> => {
    running ??= (async () => {
      const previous = snapshot.bootstrap;
      publish({
        ...snapshot,
        bootstrap: previous.phase === 'failed' ? { ...previous, retry: 'running' } : { phase: 'starting' },
      });
      const result = await runBootstrap({ session, journal, api, queryClient, network: platform.network }, reuse);
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
    if (reconcile) {
      const summary = event.summary;
      queueMicrotask(() => void runStart(summary));
    }
  });

  return {
    platform,
    api,
    queryClient,
    session,
    journal,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => runStart(),
  };
}
