import { z } from 'zod';
import { RESULT_CHECK_OFFSETS_MS, TRANSPORT_MAX_MS } from '../commands/answerWriteCoordinator.ts';
import { DomainFailure, LocalPersistenceFailure, TransportFailure } from '../failures.ts';
import type { AllDataDeleteResult } from '../models.ts';
import type { ArcaApi, Bearer } from '../ports/api.ts';
import type { NetworkPort } from '../ports/platform.ts';
import type { JournalPort, ManifestScope } from '../ports/storage.ts';
import {
  SessionChangedFailure,
  type SessionController,
  SessionModeMismatchFailure,
  StaleResultFailure,
} from '../session/sessionController.ts';

const TRACKER = 'allDataDelete';

const zTracker = z.object({
  operationId: z.string().min(1),
  ticketId: z.string().min(1).nullable(),
});
type Tracker = z.output<typeof zTracker>;

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
  journal: JournalPort;
  network: NetworkPort;
  area: () => ManifestScope | null;
  hasUnresolvedCommands: () => Promise<boolean>;
  recheckCommands: () => Promise<void>;
  setFence: (active: boolean) => void;
  discardMemory: () => void;
  finish: () => void;
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
  private target: { scope: ManifestScope & { kind: 'generation' }; generation: string } | null = null;
  private ticketId: string | null = null;
  private readonly finalized = new Map<string, number>();

  constructor(deps: AllDataDeleteCoordinatorDeps) {
    this.deps = deps;
  }

  getView = (): DeletionView => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async hasPending(area: ManifestScope): Promise<boolean> {
    try {
      return zTracker.safeParse(await this.deps.journal.getRecord(area, TRACKER)).success;
    } catch {
      return false;
    }
  }

  enter(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (this.deps.session.summary?.mode === 'DELETION_RECOVERY') return this.recover();
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

  acknowledge(): void {
    const kind = this.view.kind;
    if (kind === 'blocked' || kind === 'unsent' || kind === 'notApplied' || kind === 'failed') this.setView(IDLE);
  }

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

  retryCleanup(): Promise<void> {
    const proof = this.succeeded;
    if (!proof) return this.recover({ userRetry: true });
    return this.single(() => this.finalize(proof.ticketId, proof.resultExpiresAt));
  }

  executePrepared(): Promise<void> {
    return this.single(async () => {
      if (!this.ticketId) return;
      this.setView({ kind: 'working' });
      await this.executeAndConfirm(this.ticketId);
    });
  }

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
        return this.setView(this.view.kind === 'working' ? { kind: 'unconfirmed' } : this.view);
      }
      if (closure.state === 'CLOSED_OUTCOME_UNAVAILABLE') {
        await this.dropTracker();
        this.deps.setFence(false);
        this.setView(IDLE);
        this.deps.restart();
        return;
      }
      await this.settle(closure);
    });
  }

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
          await this.dropTracker(area);
          if (error.code === 'COMMAND_ALREADY_PENDING') {
            await this.deps.recheckCommands().catch(() => undefined);
            return this.release({ kind: 'blocked' });
          }
          return this.release({ kind: 'failed' });
        }
        const neverSent =
          attempt === 0 &&
          error instanceof TransportFailure &&
          error.reason === 'network' &&
          (await this.deps.network.isOffline());
        if (neverSent) return this.release({ kind: 'unsent' });
      }
    }
    if (!prepared) return this.setView({ kind: 'unconfirmed' });
    this.ticketId = prepared.ticketId;
    try {
      await this.deps.journal.putRecord(area, TRACKER, {
        operationId: tracker.operationId,
        ticketId: prepared.ticketId,
      });
    } catch {}
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

  private targetGeneration: string | null = null;
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
        continue;
      }
      if (result.state === 'SUCCEEDED' || result.state === 'NOT_APPLIED') return this.settle(result);
      if (result.state === 'CLOSED_OUTCOME_UNAVAILABLE') {
        return this.setView({ kind: 'unconfirmed', recovery: 'cleanUpExpired' });
      }
      if (result.state === 'PREPARED') return this.setView({ kind: 'prepared' });
    }
    this.setView({ kind: 'unconfirmed' });
  }

  private async settle(result: AllDataDeleteResult): Promise<void> {
    if (result.state === 'SUCCEEDED') return this.finalize(result.ticketId, result.resultExpiresAt);
    if (result.state !== 'NOT_APPLIED') return this.resultLoop();
    await this.dropTracker();
    const ticketId = result.ticketId;
    await this.runRestricted((auth) => this.deps.api.acknowledgeCommand(auth, ticketId)).catch(() => undefined);
    this.ticketId = null;
    this.deps.setFence(false);
    this.setView({ kind: 'notApplied', code: result.error.code });
    if (this.deps.session.summary?.mode === 'DELETION_RECOVERY') this.deps.restart();
  }

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
    this.deps.setFence(false);
    this.setView({ kind: 'finished' });
    this.deps.finish();
  }

  private async purgeUnknownArea(generation: string | null): Promise<number> {
    let root: Awaited<ReturnType<JournalPort['readRoot']>> = null;
    try {
      root = await this.deps.journal.readRoot();
    } catch {
      root = null;
    }
    const known = generation ? root?.generations.find((g) => g.generation === generation) : undefined;
    const scope = { kind: 'generation', ref: known?.ref ?? 'unknown-deleted-area' } as const;
    return (await this.deps.journal.purgeGeneration(scope, generation ?? '')).routeEpoch;
  }

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
