import { z } from 'zod';
import type { ArcaApi, Bearer } from '../../data/api/arcaApi.ts';
import type { AllDataDeleteResult } from '../../data/api/models.ts';
import { DomainFailure, LocalPersistenceFailure, TransportFailure } from '../../data/failures.ts';
import type { ManifestScope, StorageJournal } from '../../data/storage/journal.ts';
import type { NetworkPort } from '../../platform/ports.ts';
import { RESULT_CHECK_OFFSETS_MS, TRANSPORT_MAX_MS } from '../commands/answerWriteCoordinator.ts';
import {
  SessionChangedFailure,
  type SessionController,
  SessionModeMismatchFailure,
  StaleResultFailure,
} from '../session/sessionController.ts';

// F31 all-data delete (06 §4.3 `generation:*`, §9.3–9.4; 05 §6.6). Nothing local or remote is removed
// before an authenticated SUCCEEDED; after it, only the deleted generation's device area goes.

const TRACKER = 'allDataDelete';

const zTracker = z.object({
  operationId: z.string().min(1),
  ticketId: z.string().min(1).nullable(),
});
type Tracker = z.output<typeof zTracker>;

/**
 * - blocked: another command's outcome is still unknown; no deletion was prepared (06 §9.3).
 * - unsent: offline before reaching the server; nothing started (CPY-F31-017).
 * - prepared: a reserved request that was not executed; the user runs or ends it explicitly.
 * - unconfirmed: the outcome is not known; the request stays tracked. `cleanUpExpired`: the past
 *   result is gone and only an explicit OP-015 cleanup continues (04 IX-041).
 * - notApplied: an authenticated terminal NOT_APPLIED; server and device data are as they were.
 * - failed: definite refusal or a local write failure before anything was sent.
 * - cleanupFailed: SUCCEEDED, but the device area could not be removed yet; retry stays here.
 * - finished: server success and device cleanup confirmed; the app moves to F01.
 */
export type DeletionView =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'blocked' }
  | { kind: 'unsent' }
  | { kind: 'prepared' }
  | { kind: 'unconfirmed'; recovery?: 'cleanUpExpired' }
  | { kind: 'notApplied'; code: string }
  | { kind: 'failed' }
  | { kind: 'cleanupFailed' }
  | { kind: 'finished' };

export interface AllDataDeleteCoordinatorDeps {
  session: SessionController;
  api: ArcaApi;
  journal: StorageJournal;
  network: NetworkPort;
  /** The confirmed generation area right now (null in DELETION_RECOVERY before bootstrap found it). */
  area: () => ManifestScope | null;
  /** Other kept commands whose outcome is unknown (writes, answers, nickname). */
  hasUnresolvedCommands: () => Promise<boolean>;
  /** One bounded check of those commands before refusing to prepare. */
  recheckCommands: () => Promise<void>;
  /** Fence on: no other mutation or PREPARED execution; off: normal work resumes. */
  setFence: (active: boolean) => void;
  /** Drops the old generation's memory (queries, refs, views) right after SUCCEEDED (06 §9.4). */
  discardMemory: () => void;
  /** Local cleanup done: drop the restricted token and start again from OP-001 (→ F01). */
  finish: () => void;
  /** Re-establish after a NOT_APPLIED so the normal ACTIVE session comes back (05 §6.1 #4). */
  restart: () => void;
  sleep?: (ms: number) => Promise<void>;
  newOperationId?: () => string;
}

function defaultOperationId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new LocalPersistenceFailure('write');
  return id;
}

const IDLE: DeletionView = Object.freeze({ kind: 'idle' });

export class AllDataDeleteCoordinator {
  private readonly deps: AllDataDeleteCoordinatorDeps;
  private view: DeletionView = IDLE;
  private readonly listeners = new Set<() => void>();
  private inFlight: Promise<void> | null = null;
  /** Area of the generation being deleted, captured at the start (the live area may go null). */
  private target: { scope: ManifestScope & { kind: 'generation' }; generation: string } | null = null;
  private ticketId: string | null = null;
  /**
   * Finalizations per ticket in this visit. The gate re-appears only when the ack did not reach the
   * server; one more automatic round is tried, then it waits for the user (never an endless loop).
   */
  private readonly finalized = new Map<string, number>();

  constructor(deps: AllDataDeleteCoordinatorDeps) {
    this.deps = deps;
  }

  getView = (): DeletionView => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** A kept request in this generation area (restart: F31 opens before plain screens, 06 §5.3 #5). */
  async hasPending(area: ManifestScope): Promise<boolean> {
    try {
      return zTracker.safeParse(await this.deps.journal.getRecord(area, TRACKER)).success;
    } catch {
      return false;
    }
  }

  /**
   * F31 entry: the server result comes before the plain page (04 IX-036 #5). In the recovery gate the
   * ticket is checked; in ACTIVE a kept ticket is queried (safe), and a kept key without a ticket
   * waits for the user's "삭제 결과 확인하기" instead of re-sending a prepare on its own.
   */
  enter(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    // The gate always re-reads its ticket (a second gate after a lost ack included).
    if (this.deps.session.summary?.mode === 'DELETION_RECOVERY') return this.recover();
    // A finished deletion belongs to the previous generation; a new visit starts clean.
    if (this.view.kind === 'finished') this.setView(IDLE);
    if (this.view.kind !== 'idle') return Promise.resolve();
    return this.single(async () => {
      const area = this.deps.area();
      const summary = this.deps.session.summary;
      if (area?.kind !== 'generation' || !summary?.generation) return;
      const tracker = await this.readTracker(area).catch(() => null);
      if (!tracker) return;
      this.target = { scope: area, generation: summary.generation };
      this.deps.setFence(true);
      if (tracker.ticketId === null) return this.setView({ kind: 'unconfirmed' });
      this.ticketId = tracker.ticketId;
      this.setView({ kind: 'working' });
      await this.resultLoop();
    });
  }

  /** Clears a settled failure once F31 has shown it and the user starts again or leaves. */
  acknowledge(): void {
    const kind = this.view.kind;
    if (kind === 'blocked' || kind === 'unsent' || kind === 'notApplied' || kind === 'failed') this.setView(IDLE);
  }

  /** The second confirmation's action (IX-026): prepare, then execute the same ticket. */
  start(): Promise<void> {
    return this.single(async () => {
      const area = this.deps.area();
      const summary = this.deps.session.summary;
      if (area?.kind !== 'generation' || summary?.mode !== 'ACTIVE' || !summary.generation) {
        return this.setView({ kind: 'failed' });
      }
      this.target = { scope: area, generation: summary.generation };
      this.setView({ kind: 'working' });
      this.deps.setFence(true);
      // Compatibility first: a deletion is never prepared over an unknown outcome (06 §9.3).
      if (await this.deps.hasUnresolvedCommands()) {
        await this.deps.recheckCommands().catch(() => undefined);
        if (await this.deps.hasUnresolvedCommands()) return this.release({ kind: 'blocked' });
      }
      let tracker: Tracker;
      try {
        tracker = await this.trackerFor(area);
      } catch {
        return this.release({ kind: 'failed' });
      }
      await this.prepareAndRun(area, tracker);
    });
  }

  /**
   * "삭제 결과 확인하기" / restart recovery in ACTIVE mode: the kept request is checked once through
   * the same ticket (or the same prepare key when no ticket was confirmed).
   */
  recheck(): Promise<void> {
    return this.single(async () => {
      const summary = this.deps.session.summary;
      if (summary?.mode === 'DELETION_RECOVERY') return this.confirm(summary.generation);
      const area = this.deps.area();
      if (area?.kind !== 'generation' || !summary?.generation) return this.setView({ kind: 'failed' });
      this.target = { scope: area, generation: summary.generation };
      let tracker: Tracker | null;
      try {
        tracker = await this.readTracker(area);
      } catch {
        return this.setView({ kind: 'failed' });
      }
      if (!tracker) return this.release(IDLE);
      this.setView({ kind: 'working' });
      this.deps.setFence(true);
      if (tracker.ticketId === null) return this.prepareAndRun(area, tracker, { executeAfterPrepare: false });
      this.ticketId = tracker.ticketId;
      await this.resultLoop();
    });
  }

  /**
   * App-wide DELETION_RECOVERY gate (06 §5.3 #4): only this ticket's OP-008/009 and the local cleanup.
   * A ticket already finalized twice in this visit waits for the user instead of looping.
   */
  recover(options: { userRetry?: boolean } = {}): Promise<void> {
    return this.single(async () => {
      const summary = this.deps.session.summary;
      if (summary?.mode !== 'DELETION_RECOVERY') return;
      const ticketId = this.deps.session.deletionTicketId;
      if (ticketId && (this.finalized.get(ticketId) ?? 0) >= 2 && !options.userRetry) {
        return this.setView({ kind: 'cleanupFailed' });
      }
      await this.confirm(summary.generation);
    });
  }

  /**
   * "다시 시도하기" after a failed device cleanup: the SUCCEEDED proof kept in memory finishes the
   * cleanup directly; without it (restart) the recovery gate re-reads the result.
   */
  retryCleanup(): Promise<void> {
    const proof = this.succeeded;
    if (!proof) return this.recover({ userRetry: true });
    return this.single(() => this.finalize(proof.ticketId, proof.resultExpiresAt));
  }

  /** Runs the kept PREPARED ticket after the user confirms again. */
  executePrepared(): Promise<void> {
    return this.single(async () => {
      if (!this.ticketId) return;
      this.setView({ kind: 'working' });
      await this.executeAndConfirm(this.ticketId);
    });
  }

  /** Explicit OP-015 (04 IX-041): ends a prepared request, or cleans up after an expired result. */
  close(): Promise<void> {
    return this.single(async () => {
      const ticketId = this.ticketId;
      if (!ticketId) return;
      this.setView({ kind: 'working' });
      let closure: Awaited<ReturnType<ArcaApi['closeAllDataDelete']>>;
      try {
        closure = await this.runRestricted((auth) =>
          this.deps.api.closeAllDataDelete(auth, ticketId, TRANSPORT_MAX_MS),
        );
      } catch {
        // A failed close says nothing about the request; it stays tracked (05 §6.10).
        return this.setView(this.view.kind === 'working' ? { kind: 'unconfirmed' } : this.view);
      }
      if (closure.state === 'CLOSED_OUTCOME_UNAVAILABLE') {
        // Normal work resumes only from the current OP-001 generation (05 §6.10).
        await this.dropTracker();
        this.deps.setFence(false);
        this.setView(IDLE);
        this.deps.restart();
        return;
      }
      await this.settle(closure);
    });
  }

  // ---- flow ----------------------------------------------------------------------------------

  private async prepareAndRun(
    area: ManifestScope,
    tracker: Tracker,
    options: { executeAfterPrepare?: boolean } = {},
  ): Promise<void> {
    const prepare = () =>
      this.deps.session.run('ACTIVE', (auth) =>
        this.deps.api.prepareAllDataDelete(auth, tracker.operationId, TRANSPORT_MAX_MS),
      );
    let prepared: AllDataDeleteResult | null = null;
    for (let attempt = 0; attempt < 2 && prepared === null; attempt += 1) {
      try {
        prepared = await prepare();
      } catch (error) {
        if (error instanceof DomainFailure && error.category !== 'AUTH') {
          // The fence is not set by a refused prepare; pending work is checked, nothing was deleted.
          await this.dropTracker(area);
          if (error.code === 'COMMAND_ALREADY_PENDING') {
            await this.deps.recheckCommands().catch(() => undefined);
            return this.release({ kind: 'blocked' });
          }
          return this.release({ kind: 'failed' });
        }
        // "Nothing started" only when no earlier attempt could have reached the server; after a
        // timeout the reservation may exist, so the key and the fence stay (05 §8.3, 06 §9.3).
        const neverSent =
          attempt === 0 &&
          error instanceof TransportFailure &&
          error.reason === 'network' &&
          (await this.deps.network.isOffline());
        if (neverSent) return this.release({ kind: 'unsent' });
      }
    }
    // The same key is kept: a later check re-sends it and joins the same ticket (05 §9.2).
    if (!prepared) return this.setView({ kind: 'unconfirmed' });
    this.ticketId = prepared.ticketId;
    try {
      await this.deps.journal.putRecord(area, TRACKER, {
        operationId: tracker.operationId,
        ticketId: prepared.ticketId,
      });
    } catch {
      // Not kept locally: the ticket stays in memory; OP-001 recovery also names it after execution.
    }
    if (prepared.state === 'PREPARED') {
      if (options.executeAfterPrepare === false) return this.setView({ kind: 'prepared' });
      return this.executeAndConfirm(prepared.ticketId);
    }
    if (prepared.state === 'EXECUTING') return this.resultLoop();
    if (prepared.state === 'CLOSED_OUTCOME_UNAVAILABLE')
      return this.setView({ kind: 'unconfirmed', recovery: 'cleanUpExpired' });
    return this.settle(prepared);
  }

  private async executeAndConfirm(ticketId: string): Promise<void> {
    let result: AllDataDeleteResult | null = null;
    try {
      result = await this.runRestricted((auth) => this.deps.api.executeAllDataDelete(auth, ticketId, TRANSPORT_MAX_MS));
    } catch (error) {
      if (error instanceof StaleResultFailure && error.outcome.kind === 'result') {
        result = error.outcome.value as AllDataDeleteResult;
      }
      // Otherwise unknown: acceptance may already have ended the normal session (05 §6.6).
    }
    if (result && (result.state === 'SUCCEEDED' || result.state === 'NOT_APPLIED')) return this.settle(result);
    await this.resultLoop();
  }

  private async confirm(generation: string | null): Promise<void> {
    const ticketId = this.deps.session.deletionTicketId;
    if (!ticketId || !generation) return this.setView({ kind: 'unconfirmed' });
    this.ticketId = ticketId;
    const area = this.deps.area();
    this.target = area?.kind === 'generation' ? { scope: area, generation } : null;
    this.targetGeneration = generation;
    this.setView({ kind: 'working' });
    this.deps.setFence(true);
    await this.resultLoop();
  }

  /** Generation named by the recovery session when its area is already gone locally. */
  private targetGeneration: string | null = null;
  /** SUCCEEDED proof held by the deletion finalizer until the device cleanup is confirmed (06 §9.4). */
  private succeeded: { ticketId: string; resultExpiresAt: string } | null = null;

  private async resultLoop(): Promise<void> {
    const ticketId = this.ticketId;
    if (!ticketId) return this.setView({ kind: 'unconfirmed' });
    const start = Date.now();
    for (const offset of RESULT_CHECK_OFFSETS_MS) {
      const wait = start + offset - Date.now();
      if (wait > 0) await this.sleep(wait);
      let result: AllDataDeleteResult;
      try {
        result = await this.runRestricted((auth) =>
          this.deps.api.getAllDataDeleteResult(auth, ticketId, TRANSPORT_MAX_MS),
        );
      } catch {
        // A safe query failed: try the next slot; never read as "not applied" (05 §8.3).
        continue;
      }
      if (result.state === 'SUCCEEDED' || result.state === 'NOT_APPLIED') return this.settle(result);
      if (result.state === 'CLOSED_OUTCOME_UNAVAILABLE') {
        return this.setView({ kind: 'unconfirmed', recovery: 'cleanUpExpired' });
      }
      // Reserved but never executed: only the user runs or ends it.
      if (result.state === 'PREPARED') return this.setView({ kind: 'prepared' });
    }
    this.setView({ kind: 'unconfirmed' });
  }

  private async settle(result: AllDataDeleteResult): Promise<void> {
    if (result.state === 'SUCCEEDED') return this.finalize(result.ticketId, result.resultExpiresAt);
    if (result.state !== 'NOT_APPLIED') return this.resultLoop();
    // Terminal NOT_APPLIED: server and device data stay; the tracker goes, then ack (05 §6.7 OP-009).
    await this.dropTracker();
    const ticketId = result.ticketId;
    await this.runRestricted((auth) => this.deps.api.acknowledgeCommand(auth, ticketId)).catch(() => undefined);
    this.ticketId = null;
    this.deps.setFence(false);
    this.setView({ kind: 'notApplied', code: result.error.code });
    if (this.deps.session.summary?.mode === 'DELETION_RECOVERY') this.deps.restart();
  }

  /**
   * 06 §9.4 order: proof in memory → old memory dropped → old device area removed (confirmed) →
   * minimal receipt → OP-009 with the restricted token → token dropped and F01. A failed removal
   * keeps the recovery state; a failed receipt or ack never undoes the server success.
   */
  private async finalize(ticketId: string, resultExpiresAt: string): Promise<void> {
    this.succeeded = { ticketId, resultExpiresAt };
    this.setView({ kind: 'working' });
    this.deps.discardMemory();
    const generation = this.target?.generation ?? this.targetGeneration;
    let routeEpoch = 0;
    try {
      if (this.target)
        routeEpoch = (await this.deps.journal.purgeGeneration(this.target.scope, this.target.generation)).routeEpoch;
      else routeEpoch = await this.purgeUnknownArea(generation);
    } catch {
      return this.setView({ kind: 'cleanupFailed' });
    }
    if (generation) {
      await this.deps.journal
        .recordDeletion({ ticketId, deletedGeneration: generation, resultExpiresAt }, routeEpoch)
        .catch(() => undefined);
    }
    await this.runRestricted((auth) => this.deps.api.acknowledgeCommand(auth, ticketId)).catch(() => undefined);
    this.finalized.set(ticketId, (this.finalized.get(ticketId) ?? 0) + 1);
    this.succeeded = null;
    this.ticketId = null;
    this.target = null;
    this.targetGeneration = null;
    // The deleted generation's lock ends with its confirmed cleanup; a new boarding starts unfenced.
    this.deps.setFence(false);
    this.setView({ kind: 'finished' });
    this.deps.finish();
  }

  /** Recovery without a known area ref: the root decides between a targeted removal and a wipe. */
  private async purgeUnknownArea(generation: string | null): Promise<number> {
    let root: Awaited<ReturnType<StorageJournal['readRoot']>> = null;
    try {
      root = await this.deps.journal.readRoot();
    } catch {
      root = null;
    }
    const known = generation ? root?.generations.find((g) => g.generation === generation) : undefined;
    const scope = { kind: 'generation', ref: known?.ref ?? 'unknown-deleted-area' } as const;
    return (await this.deps.journal.purgeGeneration(scope, generation ?? '')).routeEpoch;
  }

  // ---- helpers -------------------------------------------------------------------------------

  /**
   * Deletion calls run in whatever mode the owner is in now. Execution acceptance ends the normal
   * session, so one re-establishment may move ACTIVE → DELETION_RECOVERY (or PRE with the receipt).
   */
  private async runRestricted<T>(call: (auth: Bearer) => Promise<T>): Promise<T> {
    const mode = this.deps.session.summary?.mode ?? 'ACTIVE';
    try {
      return await this.deps.session.run(mode, (auth) => call(auth));
    } catch (error) {
      const sessionMoved =
        error instanceof SessionModeMismatchFailure ||
        error instanceof SessionChangedFailure ||
        (error instanceof DomainFailure && error.category === 'AUTH');
      if (!sessionMoved) throw error;
      const summary = await this.deps.session.establish();
      return this.deps.session.run(summary.mode, (auth) => call(auth));
    }
  }

  private async trackerFor(area: ManifestScope): Promise<Tracker> {
    const kept = await this.readTracker(area);
    if (kept) return kept;
    const tracker: Tracker = { operationId: (this.deps.newOperationId ?? defaultOperationId)(), ticketId: null };
    // Kept and read back before anything is sent (06 §8.3).
    await this.deps.journal.putRecord(area, TRACKER, tracker);
    const back = await this.readTracker(area);
    if (!back || back.operationId !== tracker.operationId) throw new LocalPersistenceFailure('read-back');
    return back;
  }

  private async readTracker(area: ManifestScope): Promise<Tracker | null> {
    const raw = await this.deps.journal.getRecord(area, TRACKER);
    if (raw === null) return null;
    const parsed = zTracker.safeParse(raw);
    if (!parsed.success) throw new LocalPersistenceFailure('corrupt');
    return parsed.data;
  }

  private async dropTracker(area: ManifestScope | null = this.target?.scope ?? this.deps.area()): Promise<void> {
    if (area) await this.deps.journal.removeRecord(area, TRACKER).catch(() => undefined);
  }

  private release(view: DeletionView): void {
    this.deps.setFence(false);
    this.setView(view);
  }

  private sleep(ms: number): Promise<void> {
    return this.deps.sleep ? this.deps.sleep(ms) : new Promise((resolve) => setTimeout(resolve, ms));
  }

  private single(task: () => Promise<void>): Promise<void> {
    this.inFlight ??= task()
      .catch(() => {
        if (this.view.kind === 'working') this.setView({ kind: 'unconfirmed' });
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private setView(view: DeletionView): void {
    this.view = view;
    for (const listener of this.listeners) listener();
  }
}
