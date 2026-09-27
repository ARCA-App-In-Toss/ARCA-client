import type { QueryClient } from '@tanstack/react-query';
import type { ArcaApi } from '../../data/api/arcaApi.ts';
import { DomainFailure, LocalPersistenceFailure, TransportFailure } from '../../data/failures.ts';
import { queryKeys } from '../../data/query/keys.ts';
import type { ManifestScope, RootData, StorageJournal } from '../../data/storage/journal.ts';
import type { SessionController, SessionSummary } from '../../domain/session/sessionController.ts';
import type { NetworkPort } from '../../platform/ports.ts';

// F00 bootstrap (06 §5.3): key → OP-001 → owner/generation → old-area cleanup → valid manifest
// → OP-005 for ACTIVE → route. Any failure lands on F90 without creating server or local data.

export type StartErrorKind = 'general' | 'offline' | 'maintenance';

export interface StartError {
  kind: StartErrorKind;
  /** Server request id approved for support display; null hides the code area (04 CPY-F90-006). */
  safeErrorId: string | null;
}

export type BootstrapState =
  | { phase: 'starting' }
  /** `boarded`: this visit's OP-003 handoff; F03 opens once, never from a cold start (06 §9.1). */
  | { phase: 'ready'; target: 'intro' | 'today' | 'boarded'; routeEpoch: number }
  | { phase: 'failed'; error: StartError; retry: 'idle' | 'running' | 'failed' };

export const START_EXCERPT_PROFILE = 'EXPANDED' as const;

export interface BootstrapDeps {
  session: SessionController;
  journal: StorageJournal;
  api: ArcaApi;
  queryClient: QueryClient;
  network: NetworkPort;
}

class DeletionRecoveryPendingFailure extends Error {
  constructor() {
    super('bootstrap:deletion-recovery');
  }
}

function newAreaRef(): string {
  return globalThis.crypto?.randomUUID?.() ?? `area-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Aligns the device area with the confirmed owner before anything private is shown (06 §5.3 #3, #8). */
async function reconcileLocalArea(journal: StorageJournal, summary: SessionSummary): Promise<RootData> {
  const target = summary.mode === 'ACTIVE' ? summary.generation : null;
  let root = await journal.readRoot();

  if (target && !root?.generations.some((g) => g.generation === target)) {
    const ref = newAreaRef();
    // Create the manifest pair before the root points at it, so a known area is never missing.
    await journal.initArea({ kind: 'generation', ref });
    root = await journal.updateRoot((current) => ({
      currentGeneration: current?.currentGeneration ?? null,
      routeEpoch: current?.routeEpoch ?? 0,
      generations: [...(current?.generations ?? []), { generation: target, ref }],
    }));
  }
  if (!root || root.currentGeneration !== target) {
    root = await journal.updateRoot((current) => ({
      currentGeneration: target,
      routeEpoch: (current?.routeEpoch ?? 0) + (current ? 1 : 0),
      generations: current?.generations ?? [],
    }));
  }

  // Old generation areas are removed before the first screen; failure blocks start (D-TECH-041).
  for (const stale of root.generations.filter((g) => g.generation !== target)) {
    await journal.clearArea({ kind: 'generation', ref: stale.ref });
    root = await journal.updateRoot((current) => ({
      currentGeneration: current?.currentGeneration ?? null,
      routeEpoch: current?.routeEpoch ?? 0,
      generations: (current?.generations ?? []).filter((g) => g.ref !== stale.ref),
    }));
  }

  if (target) {
    const area = root.generations.find((g) => g.generation === target);
    if (!area) throw new LocalPersistenceFailure('corrupt');
    const scope: ManifestScope = { kind: 'generation', ref: area.ref };
    if ((await journal.readManifest(scope)) === null) throw new LocalPersistenceFailure('corrupt');
    await journal.repair(scope);
    // ACTIVE owner and its generation area are confirmed: the PRE creation tracker and its owner
    // verifier have nothing left to recover (06 §9.1 #5).
    await journal.clearArea({ kind: 'pre' });
  }
  return root;
}

async function classify(error: unknown, network: NetworkPort): Promise<StartError> {
  if (error instanceof DomainFailure) {
    return { kind: error.code === 'MAINTENANCE' ? 'maintenance' : 'general', safeErrorId: error.requestId };
  }
  if (error instanceof TransportFailure && (error.reason === 'network' || error.reason === 'timeout')) {
    return { kind: (await network.isOffline()) ? 'offline' : 'general', safeErrorId: null };
  }
  return { kind: 'general', safeErrorId: null };
}

/**
 * `reuse` skips OP-001 when the session was just re-established mid-visit with a new owner or mode;
 * the local area and start state are still re-checked before any private screen reopens.
 */
export interface BootstrapOutcome {
  state: BootstrapState;
  /** The confirmed device area for the ACTIVE generation; null otherwise. Kept out of React state. */
  area: ManifestScope | null;
}

export async function runBootstrap(
  deps: BootstrapDeps,
  reuse?: SessionSummary,
  handoff: 'boarded' | null = null,
): Promise<BootstrapOutcome> {
  try {
    const summary = reuse ?? (await deps.session.establish());
    // Full-deletion recovery is an app-wide gate owned by step 7; until then no private screen opens.
    if (summary.mode === 'DELETION_RECOVERY') throw new DeletionRecoveryPendingFailure();

    const root = await reconcileLocalArea(deps.journal, summary);

    if (summary.mode === 'PRE_PASSENGER') {
      return { state: { phase: 'ready', target: 'intro', routeEpoch: root.routeEpoch }, area: null };
    }
    const areaRef = root.generations.find((g) => g.generation === summary.generation)?.ref;
    if (!areaRef) throw new LocalPersistenceFailure('corrupt');

    const today = await deps.session.run('ACTIVE', (auth) => deps.api.getToday(auth, START_EXCERPT_PROFILE));
    const generation = summary.generation ?? '';
    deps.queryClient.setQueryData(queryKeys.today(summary.ownerScope, generation, START_EXCERPT_PROFILE), today);
    return {
      state: { phase: 'ready', target: handoff ?? 'today', routeEpoch: root.routeEpoch },
      area: { kind: 'generation', ref: areaRef },
    };
  } catch (error) {
    return { state: { phase: 'failed', error: await classify(error, deps.network), retry: 'idle' }, area: null };
  }
}
