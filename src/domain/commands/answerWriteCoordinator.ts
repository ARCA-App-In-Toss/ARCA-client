import { DRAFT_TTL_MS, type DraftRepository } from '../drafts/draftRepository.ts';
import type { Timers } from '../drafts/draftWriter.ts';
import { DomainFailure } from '../failures.ts';
import type {
  AnswerDeleteClosure,
  AnswerDeleteResult,
  AnswerWriteClosure,
  AnswerWritePresentation,
  AnswerWriteResult,
  PrepareAnswerDelete,
  PrepareAnswerWrite,
  Reconciliation,
} from '../models.ts';
import type { ArcaApi } from '../ports/api.ts';
import type { SessionController } from '../session/sessionController.ts';
import type { AnswerPrepareInput, AnswerWriteStore, AnswerWriteTracker } from './answerWriteStore.ts';

export const RESULT_CYCLE_MS = 10_000;
export const TRANSPORT_MAX_MS = 8_000;
export const RESULT_CHECK_OFFSETS_MS = [0, 1_000, 3_000, 7_000] as const;
export const COMPLETION_EXCERPT_PROFILE = 'COMPACT' as const;
export const EDIT_EXCERPT_PROFILE = 'STANDARD' as const;
export const PAYLOAD_TTL_MS = DRAFT_TTL_MS;

export interface Completion {
  answerId: string;
  presentation: AnswerWritePresentation;
}

export type WriteView =
  | { kind: 'idle' }
  | { kind: 'working'; stage: 'keeping' | 'sending' | 'confirming'; trackerKept: boolean }
  | { kind: 'unconfirmed'; trackerKept: boolean; recovery?: 'closePrepared' | 'cleanUpExpired' }
  | { kind: 'reconciled'; reconciliation: Reconciliation }
  | { kind: 'succeeded'; completion: Completion }
  | { kind: 'deleted' }
  | { kind: 'notApplied'; code: string }
  | { kind: 'rejected'; code: string }
  | { kind: 'localFailure' };

export type Unfinished =
  | { kind: 'unresolved'; mode: 'CREATE'; questionId: string }
  | { kind: 'unresolved'; mode: 'UPDATE' | 'DELETE' }
  | { kind: 'finishing' }
  | null;

export interface KeptDraft {
  text: string;
  lastModifiedAt: number;
}

export interface SaveRequest {
  input: PrepareAnswerWrite;
  flushDraft(): Promise<KeptDraft | null>;
}

export interface DeleteRequest {
  input: PrepareAnswerDelete;
}

export type SyncEvent =
  | { kind: 'created'; answerId: string }
  | {
      kind: 'updated';
      answerId: string;
      baseRevision: string;
      revision: string;
      content: string | null;
      ticketId: string | null;
    }
  | { kind: 'deleted'; answerId: string }
  | { kind: 'notApplied'; answerId: string }
  | { kind: 'reconciled'; answerId: string };

export interface OwnerFence {
  ownerScope: string;
  generation: string | null;
}

export interface AnswerWriteCoordinatorDeps {
  session: SessionController;
  api: ArcaApi;
  store: AnswerWriteStore;
  drafts: DraftRepository;
  now: () => number;
  fence: () => OwnerFence | null;
  timers?: Timers;
  newOperationId?: () => string;
  syncCurrentResources(event: SyncEvent): Promise<void>;
  deletionFenced?: () => boolean;
}

const realTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const IDLE_VIEW: WriteView = Object.freeze({ kind: 'idle' });

function neverSent(tracker: AnswerWriteTracker): boolean {
  return tracker.ticketId === null && !tracker.networkAllowed;
}

type CommandResult = AnswerWriteResult | AnswerDeleteResult;

function isTerminal(result: CommandResult): boolean {
  return result.state === 'SUCCEEDED' || result.state === 'NOT_APPLIED';
}

export function targetOf(input: AnswerPrepareInput | PrepareAnswerWrite): string {
  return input.mode === 'CREATE' ? input.dailySemaId : input.answerId;
}

class AbandonedRun extends Error {
  constructor() {
    super('command:abandoned');
  }
}

interface Run {
  target: string;
  check(): void;
  setView(view: WriteView): void;
}

export class AnswerWriteCoordinator {
  private readonly deps: AnswerWriteCoordinatorDeps;
  private readonly timers: Timers;
  private readonly views = new Map<string, WriteView>();
  private readonly listeners = new Map<string, Set<(view: WriteView) => void>>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private epoch = 0;
  private suspended = false;
  private readonly sleepers = new Set<() => void>();
  private readonly announced = new Set<string>();

  constructor(deps: AnswerWriteCoordinatorDeps) {
    this.deps = deps;
    this.timers = deps.timers ?? realTimers;
  }

  getView(dailySemaId: string): WriteView {
    return this.views.get(dailySemaId) ?? IDLE_VIEW;
  }

  subscribe(dailySemaId: string, listener: (view: WriteView) => void): () => void {
    const set = this.listeners.get(dailySemaId) ?? new Set();
    set.add(listener);
    this.listeners.set(dailySemaId, set);
    return () => set.delete(listener);
  }

  reset(): void {
    this.epoch += 1;
    this.announced.clear();
    this.inFlight.clear();
    const targets = [...this.views.keys()];
    this.views.clear();
    for (const target of targets) this.emit(target, IDLE_VIEW);
  }

  suspend(): void {
    this.suspended = true;
    for (const wake of [...this.sleepers]) wake();
  }

  resume(): void {
    this.suspended = false;
  }

  async recheckAll(options: { except?: string | null; concurrency?: number } = {}): Promise<void> {
    if (this.deps.deletionFenced?.()) return;
    let targets: string[];
    try {
      targets = (await this.deps.store.listTargets()).filter((t) => t !== options.except);
    } catch {
      return;
    }
    const queue = [...targets];
    const worker = async () => {
      for (let target = queue.shift(); target !== undefined; target = queue.shift()) {
        const tracker = await this.deps.store.getTracker(target).catch(() => null);
        if (!tracker) continue;
        await this.recheck(target, { quiet: tracker.outcome !== null }).catch(() => undefined);
      }
    };
    await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 2, queue.length) }, worker));
  }

  acknowledgeView(dailySemaId: string): void {
    const view = this.getView(dailySemaId);
    if (view.kind !== 'working') this.setView(dailySemaId, IDLE_VIEW);
  }

  async hasUnresolved(): Promise<boolean> {
    try {
      for (const target of await this.deps.store.listTargets()) {
        const tracker = await this.deps.store.getTracker(target);
        if (tracker && tracker.outcome === null) return true;
      }
      return false;
    } catch {
      return true;
    }
  }

  async unfinished(dailySemaId: string): Promise<Unfinished> {
    const tracker = await this.deps.store.getTracker(dailySemaId);
    if (!tracker) return null;
    if (tracker.outcome) return { kind: 'finishing' };
    const input = tracker.prepareInput;
    return input.mode === 'CREATE'
      ? { kind: 'unresolved', mode: 'CREATE', questionId: input.questionId }
      : { kind: 'unresolved', mode: input.mode };
  }

  save(request: SaveRequest): Promise<void> {
    const target = targetOf(request.input);
    const running = this.inFlight.get(target);
    if (running) return running;
    if (this.refuseBehindDeletion(target)) return Promise.resolve();
    this.setView(target, { kind: 'working', stage: 'keeping', trackerKept: false });
    return this.singleFlight(target, async (run) => {
      let existing: AnswerWriteTracker | null;
      try {
        existing = await this.deps.store.getTracker(target);
      } catch {
        return run.setView({ kind: 'localFailure' });
      }
      run.check();
      if (existing && !neverSent(existing)) return this.drive(run, { quiet: false });

      const kept = await request.flushDraft();
      run.check();
      if (!kept) return run.setView({ kind: 'localFailure' });
      const operationId = this.deps.newOperationId?.() ?? crypto.randomUUID();
      try {
        const tracker: AnswerWriteTracker = {
          recordType: 'command',
          kind: 'ANSWER_WRITE',
          operationId,
          prepareInput: request.input,
          executeIntent: true,
          networkAllowed: false,
          ticketId: null,
          outcome: null,
          createdAt: this.deps.now(),
        };
        await this.deps.store.putTracker(target, tracker);
        run.check();
        await this.deps.store.putPayload(target, {
          recordType: 'command-payload',
          operationId,
          content: kept.text,
          lastModifiedAt: kept.lastModifiedAt,
        });
        run.check();
        await this.deps.store.putTracker(target, { ...tracker, networkAllowed: true });
      } catch (error) {
        if (error instanceof AbandonedRun) throw error;
        await this.deps.store.removeTracker(target).catch(() => undefined);
        return run.setView({ kind: 'localFailure' });
      }
      run.check();
      return this.drive(run, { quiet: false });
    });
  }

  delete(request: DeleteRequest): Promise<void> {
    const target = request.input.answerId;
    const running = this.inFlight.get(target);
    if (running) return running;
    if (this.refuseBehindDeletion(target)) return Promise.resolve();
    this.setView(target, { kind: 'working', stage: 'keeping', trackerKept: false });
    return this.singleFlight(target, async (run) => {
      let existing: AnswerWriteTracker | null;
      try {
        existing = await this.deps.store.getTracker(target);
      } catch {
        return run.setView({ kind: 'localFailure' });
      }
      run.check();
      if (existing && !neverSent(existing)) return this.drive(run, { quiet: false });
      const operationId = this.deps.newOperationId?.() ?? crypto.randomUUID();
      const tracker: AnswerWriteTracker = {
        recordType: 'command',
        kind: 'ANSWER_DELETE',
        operationId,
        prepareInput: { mode: 'DELETE', answerId: target, expectedRevision: request.input.expectedRevision },
        executeIntent: true,
        networkAllowed: false,
        ticketId: null,
        outcome: null,
        createdAt: this.deps.now(),
      };
      try {
        await this.deps.store.putTracker(target, tracker);
        run.check();
        await this.deps.store.putTracker(target, { ...tracker, networkAllowed: true });
      } catch (error) {
        if (error instanceof AbandonedRun) throw error;
        await this.deps.store.removeTracker(target).catch(() => undefined);
        return run.setView({ kind: 'localFailure' });
      }
      run.check();
      return this.drive(run, { quiet: false });
    });
  }

  recheck(dailySemaId: string, options: { quiet?: boolean } = {}): Promise<void> {
    return this.singleFlight(dailySemaId, async (run) => {
      let tracker: AnswerWriteTracker | null;
      try {
        tracker = await this.deps.store.getTracker(dailySemaId);
      } catch {
        return run.setView({ kind: 'localFailure' });
      }
      run.check();
      if (!tracker) return;
      return this.drive(run, { quiet: options.quiet === true && tracker.outcome !== null });
    });
  }

  close(dailySemaId: string): Promise<void> {
    return this.singleFlight(dailySemaId, async (run) => {
      let tracker: AnswerWriteTracker | null;
      try {
        tracker = await this.deps.store.getTracker(dailySemaId);
      } catch {
        return run.setView({ kind: 'localFailure' });
      }
      run.check();
      if (!tracker) return run.setView(IDLE_VIEW);
      if (tracker.outcome || tracker.ticketId === null) return this.drive(run, { quiet: false });
      const ticketId = tracker.ticketId;
      run.setView({ kind: 'working', stage: 'confirming', trackerKept: true });
      let closure: AnswerWriteClosure | AnswerDeleteClosure;
      const isDelete = tracker.kind === 'ANSWER_DELETE';
      try {
        closure = await this.deps.session.run<AnswerWriteClosure | AnswerDeleteClosure>('ACTIVE', (auth) =>
          isDelete
            ? this.deps.api.closeAnswerDelete(auth, ticketId, TRANSPORT_MAX_MS)
            : this.deps.api.closeAnswerWrite(auth, ticketId, TRANSPORT_MAX_MS),
        );
      } catch {
        run.check();
        return run.setView({ kind: 'unconfirmed', trackerKept: true });
      }
      run.check();
      if (closure.state === 'SUCCEEDED' || closure.state === 'NOT_APPLIED') {
        return this.settle(run, tracker, closure, { quiet: false });
      }
      if (closure.state === 'CLOSED_OUTCOME_UNAVAILABLE') return this.reconcile(run, closure.reconciliation);
      return run.setView({ kind: 'unconfirmed', trackerKept: true });
    });
  }

  private singleFlight(target: string, task: (run: Run) => Promise<void>): Promise<void> {
    const running = this.inFlight.get(target);
    if (running) return running;
    const run = this.newRun(target);
    const startedEpoch = this.epoch;
    const promise: Promise<void> = task(run)
      .catch((error: unknown) => {
        if (!(error instanceof AbandonedRun)) throw error;
        if (startedEpoch === this.epoch && this.getView(target).kind === 'working') this.setView(target, IDLE_VIEW);
      })
      .finally(() => {
        if (this.inFlight.get(target) === promise) this.inFlight.delete(target);
      });
    this.inFlight.set(target, promise);
    return promise;
  }

  private newRun(target: string): Run {
    const epoch = this.epoch;
    const fence = this.deps.fence();
    const alive = () => {
      const now = this.deps.fence();
      return (
        epoch === this.epoch &&
        fence !== null &&
        now !== null &&
        now.ownerScope === fence.ownerScope &&
        now.generation === fence.generation
      );
    };
    return {
      target,
      check: () => {
        if (!alive()) throw new AbandonedRun();
      },
      setView: (view) => {
        if (!alive()) throw new AbandonedRun();
        this.setView(target, view);
      },
    };
  }

  private async drive(run: Run, options: { quiet: boolean }): Promise<void> {
    const { target } = run;
    const cycleStart = this.deps.now();
    const remaining = () => Math.max(0, cycleStart + RESULT_CYCLE_MS - this.deps.now());
    const budget = () => Math.min(TRANSPORT_MAX_MS, remaining());

    let tracker = await this.deps.store.getTracker(target);
    run.check();
    if (!tracker) return run.setView(IDLE_VIEW);
    if (tracker.outcome) return this.finalize(run, tracker, null, options);
    if (neverSent(tracker)) {
      await this.dropUnsent(run);
      return run.setView(IDLE_VIEW);
    }
    run.setView({ kind: 'working', stage: 'sending', trackerKept: true });

    let result: CommandResult | null = null;
    let executed = false;

    if (tracker.ticketId === null) {
      const ticketTracker = tracker;
      const input = ticketTracker.prepareInput;
      try {
        result = await this.deps.session.run<CommandResult>('ACTIVE', (auth) =>
          input.mode === 'DELETE'
            ? this.deps.api.prepareAnswerDelete(
                auth,
                ticketTracker.operationId,
                { answerId: input.answerId, expectedRevision: input.expectedRevision },
                budget(),
              )
            : this.deps.api.prepareAnswerWrite(auth, ticketTracker.operationId, input, budget()),
        );
      } catch (error) {
        run.check();
        if (error instanceof DomainFailure && error.code !== 'COMMAND_ALREADY_PENDING') {
          await this.dropUnsent(run);
          return run.setView({ kind: 'rejected', code: error.code });
        }
        return run.setView({ kind: 'unconfirmed', trackerKept: true });
      }
      run.check();
      tracker = { ...tracker, ticketId: result.ticketId };
      try {
        await this.deps.store.putTracker(target, tracker);
      } catch {
        return run.setView({ kind: 'unconfirmed', trackerKept: false });
      }
      run.check();
    }

    const settledFrom = tracker;
    const ticketId = tracker.ticketId as string;
    const isDelete = settledFrom.kind === 'ANSWER_DELETE';
    const execute = async (): Promise<CommandResult | 'unexecutable' | null> => {
      if (this.deps.deletionFenced?.()) return null;
      if (isDelete) {
        if (!settledFrom.executeIntent) return 'unexecutable';
        executed = true;
        try {
          return await this.deps.session.run('ACTIVE', (auth) =>
            this.deps.api.executeAnswerDelete(auth, ticketId, budget()),
          );
        } catch {
          return null;
        }
      }
      let payload = await this.deps.store.getPayload(target, settledFrom.operationId).catch(() => null);
      run.check();
      if (payload && this.payloadExpired(payload.lastModifiedAt)) {
        await this.deps.store.removePayload(target).catch(() => undefined);
        run.check();
        payload = null;
      }
      if (!payload || !settledFrom.executeIntent) return 'unexecutable';
      executed = true;
      try {
        return await this.deps.session.run('ACTIVE', (auth) =>
          this.deps.api.executeAnswerWrite(auth, ticketId, payload.content, budget()),
        );
      } catch {
        return null;
      }
    };

    const closable = () => run.setView({ kind: 'unconfirmed', trackerKept: true, recovery: 'closePrepared' });
    const sealed = () => run.setView({ kind: 'unconfirmed', trackerKept: true, recovery: 'cleanUpExpired' });
    if (result?.state === 'CLOSED_OUTCOME_UNAVAILABLE') return sealed();
    if (result?.state === 'PREPARED') {
      const outcome = await execute();
      run.check();
      if (outcome === 'unexecutable') return closable();
      result = outcome;
    }
    if (result && isTerminal(result)) return this.settle(run, settledFrom, result, options);

    run.setView({ kind: 'working', stage: 'confirming', trackerKept: true });
    for (const offset of RESULT_CHECK_OFFSETS_MS) {
      const wait = cycleStart + offset - this.deps.now();
      if (wait > 0) await this.sleep(wait);
      run.check();
      if (this.suspended || remaining() <= 0) break;
      try {
        const profile = settledFrom.prepareInput.mode === 'UPDATE' ? EDIT_EXCERPT_PROFILE : COMPLETION_EXCERPT_PROFILE;
        const current = await this.deps.session.run<CommandResult>('ACTIVE', (auth) =>
          isDelete
            ? this.deps.api.getAnswerDeleteResult(auth, ticketId, budget())
            : this.deps.api.getAnswerWriteResult(auth, ticketId, profile, budget()),
        );
        run.check();
        if (isTerminal(current)) return this.settle(run, settledFrom, current, options);
        if (current.state === 'CLOSED_OUTCOME_UNAVAILABLE') return sealed();
        if (current.state === 'PREPARED' && !executed) {
          const executedResult = await execute();
          run.check();
          if (executedResult === 'unexecutable') return closable();
          if (executedResult && isTerminal(executedResult)) {
            return this.settle(run, settledFrom, executedResult, options);
          }
        }
      } catch (error) {
        if (error instanceof AbandonedRun) throw error;
      }
    }
    return run.setView({ kind: 'unconfirmed', trackerKept: true });
  }

  private async settle(
    run: Run,
    tracker: AnswerWriteTracker,
    result: CommandResult,
    options: { quiet: boolean },
  ): Promise<void> {
    const outcome: AnswerWriteTracker['outcome'] =
      result.state === 'SUCCEEDED'
        ? 'effect' in result.proof
          ? { state: 'SUCCEEDED', answerId: result.proof.answerId, effect: result.proof.effect }
          : { state: 'SUCCEEDED', answerId: result.proof.answerId, revision: result.proof.revision }
        : result.state === 'NOT_APPLIED'
          ? { state: 'NOT_APPLIED', code: result.error.code, category: result.error.category }
          : null;
    const settled = { ...tracker, outcome };
    try {
      await this.deps.store.putTracker(run.target, settled);
    } catch {
      run.check();
      return run.setView(this.viewFor(settled, result, options));
    }
    run.check();
    return this.finalize(run, settled, result, options);
  }

  private async finalize(
    run: Run,
    tracker: AnswerWriteTracker,
    result: CommandResult | null,
    options: { quiet: boolean },
  ): Promise<void> {
    const outcome = tracker.outcome;
    if (!outcome) return;
    run.setView(this.viewFor(tracker, result, options));
    const input = tracker.prepareInput;

    if (outcome.state === 'SUCCEEDED') {
      let event: SyncEvent;
      try {
        if (input.mode === 'CREATE') {
          await this.deps.drafts.removeAllForDailySema(run.target);
          event = { kind: 'created', answerId: outcome.answerId };
        } else if (input.mode === 'UPDATE') {
          const payload = await this.deps.store.getPayload(run.target, tracker.operationId).catch(() => null);
          run.check();
          await this.deps.drafts.remove({
            kind: 'update',
            answerId: input.answerId,
            baseRevision: input.expectedRevision,
          });
          event = {
            kind: 'updated',
            answerId: input.answerId,
            baseRevision: input.expectedRevision,
            revision: 'revision' in outcome ? outcome.revision : input.expectedRevision,
            content: payload?.content ?? null,
            ticketId: tracker.ticketId,
          };
        } else {
          await this.deps.drafts.removeAllForAnswer(input.answerId);
          event = { kind: 'deleted', answerId: input.answerId };
        }
      } catch (error) {
        if (error instanceof AbandonedRun) throw error;
        return;
      }
      run.check();
      await this.deps.syncCurrentResources(event).catch(() => undefined);
      run.check();
    } else if (input.mode !== 'CREATE') {
      await this.deps.syncCurrentResources({ kind: 'notApplied', answerId: input.answerId }).catch(() => undefined);
      run.check();
    }
    try {
      await this.deps.store.removePayload(run.target);
    } catch {
      return;
    }
    run.check();
    const ticketId = tracker.ticketId;
    if (ticketId) {
      await this.deps.session
        .run('ACTIVE', (auth) => this.deps.api.acknowledgeCommand(auth, ticketId))
        .catch(() => undefined);
      run.check();
    }
    await this.deps.store.removeTracker(run.target).catch(() => undefined);
  }

  private viewFor(tracker: AnswerWriteTracker, result: CommandResult | null, options: { quiet: boolean }): WriteView {
    const outcome = tracker.outcome;
    if (!outcome || options.quiet) return IDLE_VIEW;
    if (tracker.ticketId !== null) {
      if (this.announced.has(tracker.ticketId)) return IDLE_VIEW;
      this.announced.add(tracker.ticketId);
    }
    if (outcome.state === 'NOT_APPLIED') return { kind: 'notApplied', code: outcome.code };
    if ('effect' in outcome) return { kind: 'deleted' };
    const presentation: AnswerWritePresentation =
      result?.state === 'SUCCEEDED' && !('effect' in result.proof)
        ? (result as Extract<AnswerWriteResult, { state: 'SUCCEEDED' }>).presentation
        : { state: 'UNAVAILABLE', retryable: true };
    return { kind: 'succeeded', completion: { answerId: outcome.answerId, presentation } };
  }

  private async reconcile(run: Run, reconciliation: Reconciliation): Promise<void> {
    try {
      await this.deps.store.removePayload(run.target);
      run.check();
      await this.deps.store.removeTracker(run.target);
    } catch (error) {
      if (error instanceof AbandonedRun) throw error;
    }
    run.check();
    if (reconciliation.nextAction === 'REVIEW_CURRENT_ANSWER') {
      await this.deps
        .syncCurrentResources({ kind: 'reconciled', answerId: reconciliation.answerId })
        .catch(() => undefined);
      run.check();
    }
    return run.setView({ kind: 'reconciled', reconciliation });
  }

  private async dropUnsent(run: Run): Promise<void> {
    try {
      run.check();
      await this.deps.store.removePayload(run.target);
      run.check();
      await this.deps.store.removeTracker(run.target);
    } catch (error) {
      if (error instanceof AbandonedRun) throw error;
    }
  }

  async expirePayloads(): Promise<void> {
    const fence = this.deps.fence();
    if (!fence) return;
    const epoch = this.epoch;
    const same = () => {
      const now = this.deps.fence();
      return epoch === this.epoch && now?.ownerScope === fence.ownerScope && now.generation === fence.generation;
    };
    for (const target of await this.deps.store.listTargets()) {
      if (!same() || this.inFlight.has(target)) continue;
      const tracker = await this.deps.store.getTracker(target).catch(() => null);
      if (!tracker || !same()) continue;
      const payload = await this.deps.store.getPayload(target, tracker.operationId).catch(() => null);
      if (!payload || !this.payloadExpired(payload.lastModifiedAt) || !same() || this.inFlight.has(target)) continue;
      const latest = await this.deps.store.getTracker(target).catch(() => null);
      if (latest?.operationId !== tracker.operationId || !same() || this.inFlight.has(target)) continue;
      await this.deps.store.removePayload(target).catch(() => undefined);
    }
  }

  private payloadExpired(lastModifiedAt: number): boolean {
    return this.deps.now() >= lastModifiedAt + PAYLOAD_TTL_MS;
  }

  private refuseBehindDeletion(target: string): boolean {
    if (!this.deps.deletionFenced?.()) return false;
    this.setView(target, { kind: 'rejected', code: 'COMMAND_ALREADY_PENDING' });
    return true;
  }

  private sleep(ms: number): Promise<void> {
    if (this.suspended) return Promise.resolve();
    return new Promise((resolve) => {
      let handle: unknown = null;
      const wake = () => {
        this.sleepers.delete(wake);
        if (handle !== null) this.timers.clear(handle);
        resolve();
      };
      this.sleepers.add(wake);
      handle = this.timers.set(wake, ms);
    });
  }

  private setView(target: string, view: WriteView): void {
    this.views.set(target, view);
    this.emit(target, view);
  }

  private emit(target: string, view: WriteView): void {
    for (const listener of this.listeners.get(target) ?? []) listener(view);
  }
}
