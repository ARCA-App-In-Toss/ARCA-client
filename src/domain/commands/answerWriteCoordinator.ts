import type { ArcaApi } from '../../data/api/arcaApi.ts';
import type { AnswerWritePresentation, AnswerWriteResult, PrepareAnswerCreate } from '../../data/api/models.ts';
import { DomainFailure } from '../../data/failures.ts';
import type { DraftRepository } from '../drafts/draftRepository.ts';
import type { Timers } from '../drafts/draftWriter.ts';
import type { SessionController } from '../session/sessionController.ts';
import type { AnswerWriteStore, AnswerWriteTracker } from './answerWriteStore.ts';

// Answer-write command lifecycle (06 §8.3–8.7, 05 OP-006~009). Nothing goes on the network until the
// latest text, the tracker and the fixed payload are read back. Only an authenticated SUCCEEDED or
// NOT_APPLIED ends a command; timeouts, lost responses and unmounts never mean "not applied".
// Every run is bound to the owner/generation it started under and stops once that changes.

export const RESULT_CYCLE_MS = 10_000;
export const TRANSPORT_MAX_MS = 8_000;
/** OP-008 attempt offsets inside one foreground cycle (06 §8.5). */
export const RESULT_CHECK_OFFSETS_MS = [0, 1_000, 3_000, 7_000] as const;
export const COMPLETION_EXCERPT_PROFILE = 'COMPACT' as const;

export interface Completion {
  answerId: string;
  presentation: AnswerWritePresentation;
}

export type WriteView =
  | { kind: 'idle' }
  /** Local pre-keeping, then network; `trackerKept` enables safe exit once the draft is kept too. */
  | { kind: 'working'; stage: 'keeping' | 'sending' | 'confirming'; trackerKept: boolean }
  | { kind: 'unconfirmed'; trackerKept: boolean }
  | { kind: 'succeeded'; completion: Completion }
  | { kind: 'notApplied'; code: string }
  /** Authenticated prepare rejection; no ticket was created. */
  | { kind: 'rejected'; code: string }
  /** Pre-keeping or tracker read failed; nothing was sent. */
  | { kind: 'localFailure' };

export type Unfinished = { kind: 'unresolved'; questionId: string } | { kind: 'finishing' } | null;

/** Latest draft confirmed in Storage at flush time; the payload is built from exactly this. */
export interface KeptDraft {
  text: string;
  lastModifiedAt: number;
}

export interface SaveRequest {
  input: PrepareAnswerCreate;
  /** Flushes the open draft; the read-back text, or null when it could not be kept. */
  flushDraft(): Promise<KeptDraft | null>;
}

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
  /** The confirmed owner/generation right now, or null while none is confirmed. */
  fence: () => OwnerFence | null;
  timers?: Timers;
  newOperationId?: () => string;
  /** Current-resource sync after success (today/archive caches); must be repeat-safe. */
  syncAfterSuccess(answerId: string): Promise<void>;
}

const realTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Shared idle snapshot: view reads must be referentially stable for subscribers. */
const IDLE_VIEW: WriteView = Object.freeze({ kind: 'idle' });

function isTerminal(result: AnswerWriteResult): boolean {
  return result.state === 'SUCCEEDED' || result.state === 'NOT_APPLIED';
}

/** A run whose owner, generation or reset epoch changed; it stops without touching state. */
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

  /** Owner/generation change or discard: drop every view and ignore all in-flight runs (06 §4.2). */
  reset(): void {
    this.epoch += 1;
    this.inFlight.clear();
    const targets = [...this.views.keys()];
    this.views.clear();
    for (const target of targets) this.emit(target, IDLE_VIEW);
  }

  /** Clears a settled view once the screen has consumed it (visit feedback is separate from cleanup). */
  acknowledgeView(dailySemaId: string): void {
    const view = this.getView(dailySemaId);
    if (view.kind !== 'working') this.setView(dailySemaId, IDLE_VIEW);
  }

  /** Unresolved save (blocks new writes, 04 IX-036 #5) or unfinished local finishing, if any. */
  async unfinished(dailySemaId: string): Promise<Unfinished> {
    const tracker = await this.deps.store.getTracker(dailySemaId);
    if (!tracker) return null;
    return tracker.outcome
      ? { kind: 'finishing' }
      : { kind: 'unresolved', questionId: tracker.prepareInput.questionId };
  }

  /** User save. Single-flight per target; an unresolved tracker is resumed, never replaced. */
  save(request: SaveRequest): Promise<void> {
    const target = request.input.dailySemaId;
    const running = this.inFlight.get(target);
    if (running) return running;
    // Lock the text before the first await so nothing typed can diverge from the kept payload.
    this.setView(target, { kind: 'working', stage: 'keeping', trackerKept: false });
    return this.singleFlight(target, async (run) => {
      let existing: AnswerWriteTracker | null;
      try {
        existing = await this.deps.store.getTracker(target);
      } catch {
        return run.setView({ kind: 'localFailure' });
      }
      run.check();
      if (existing) return this.drive(run, { quiet: false });

      // 06 §8.3: latest draft → tracker meta → fixed payload, each read back, before any mutation.
      const kept = await request.flushDraft();
      run.check();
      if (!kept) return run.setView({ kind: 'localFailure' });
      const operationId = this.deps.newOperationId?.() ?? crypto.randomUUID();
      try {
        await this.deps.store.putTracker(target, {
          recordType: 'command',
          kind: 'ANSWER_WRITE',
          operationId,
          prepareInput: request.input,
          executeIntent: true,
          ticketId: null,
          outcome: null,
          createdAt: this.deps.now(),
        });
        run.check();
        await this.deps.store.putPayload(target, {
          recordType: 'command-payload',
          operationId,
          content: kept.text,
          lastModifiedAt: kept.lastModifiedAt,
        });
      } catch (error) {
        if (error instanceof AbandonedRun) throw error;
        // Nothing was sent; drop the partial tracker if possible so the next save starts clean.
        await this.deps.store.removeTracker(target).catch(() => undefined);
        return run.setView({ kind: 'localFailure' });
      }
      run.check();
      return this.drive(run, { quiet: false });
    });
  }

  /**
   * "결과 다시 확인하기" or re-entry: a new bounded cycle, or resumed finishing; never a new
   * operation (06 §8.5 #5–6). `quiet` finishing (nothing new to tell) ends without a notice.
   */
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

  private singleFlight(target: string, task: (run: Run) => Promise<void>): Promise<void> {
    const running = this.inFlight.get(target);
    if (running) return running;
    const run = this.newRun(target);
    const startedEpoch = this.epoch;
    const promise: Promise<void> = task(run)
      .catch((error: unknown) => {
        if (!(error instanceof AbandonedRun)) throw error;
        // Same owner, but the area/fence moved (e.g. a reconcile): never leave the screen locked in
        // 'working'. A kept tracker is picked up again by the re-entry recheck (06 §8.6, 04 IX-007).
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
      // A dead run must end through AbandonedRun (never a silent no-op), so singleFlight can release
      // a 'working' lock left in the same epoch (06 §4.2, §8.3).
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
    run.setView({ kind: 'working', stage: 'sending', trackerKept: true });

    let result: AnswerWriteResult | null = null;
    let executed = false;

    if (tracker.ticketId === null) {
      // Prepare, or restore a lost prepare response with the same operation id and input (05 OP-006).
      const ticketTracker = tracker;
      try {
        result = await this.deps.session.run('ACTIVE', (auth) =>
          this.deps.api.prepareAnswerWrite(auth, ticketTracker.operationId, ticketTracker.prepareInput, budget()),
        );
      } catch (error) {
        run.check();
        if (error instanceof DomainFailure && error.code !== 'COMMAND_ALREADY_PENDING') {
          // Authenticated rejection: no ticket exists for this request (05 §8.3).
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
        // Without the ticket on the device, execution would be unrecoverable: do not send OP-007.
        return run.setView({ kind: 'unconfirmed', trackerKept: false });
      }
      run.check();
    }

    const settledFrom = tracker;
    const ticketId = tracker.ticketId as string;
    const execute = async (): Promise<AnswerWriteResult | null> => {
      const payload = await this.deps.store.getPayload(target, settledFrom.operationId).catch(() => null);
      run.check();
      // Only the exact kept payload with the original intent may run (05 OP-006 re-entry rule).
      if (!payload || !settledFrom.executeIntent) return null;
      executed = true;
      try {
        return await this.deps.session.run('ACTIVE', (auth) =>
          this.deps.api.executeAnswerWrite(auth, ticketId, payload.content, budget()),
        );
      } catch {
        return null; // Unknown outcome: confirm with OP-008.
      }
    };

    if (result?.state === 'PREPARED') result = await execute();
    run.check();
    if (result && isTerminal(result)) return this.settle(run, settledFrom, result, options);

    run.setView({ kind: 'working', stage: 'confirming', trackerKept: true });
    for (const offset of RESULT_CHECK_OFFSETS_MS) {
      const wait = cycleStart + offset - this.deps.now();
      if (wait > 0) await this.sleep(wait);
      run.check();
      if (remaining() <= 0) break;
      try {
        const current = await this.deps.session.run('ACTIVE', (auth) =>
          this.deps.api.getAnswerWriteResult(auth, ticketId, COMPLETION_EXCERPT_PROFILE, budget()),
        );
        run.check();
        if (isTerminal(current)) return this.settle(run, settledFrom, current, options);
        if (current.state === 'PREPARED' && !executed) {
          const executedResult = await execute();
          run.check();
          if (executedResult && isTerminal(executedResult)) {
            return this.settle(run, settledFrom, executedResult, options);
          }
        }
      } catch (error) {
        if (error instanceof AbandonedRun) throw error;
        // Transport/protocol trouble on a safe query: try the next slot; never infer "not applied".
      }
    }
    return run.setView({ kind: 'unconfirmed', trackerKept: true });
  }

  private async settle(
    run: Run,
    tracker: AnswerWriteTracker,
    result: AnswerWriteResult,
    options: { quiet: boolean },
  ): Promise<void> {
    const outcome: AnswerWriteTracker['outcome'] =
      result.state === 'SUCCEEDED'
        ? { state: 'SUCCEEDED', answerId: result.proof.answerId, revision: result.proof.revision }
        : result.state === 'NOT_APPLIED'
          ? { state: 'NOT_APPLIED', code: result.error.code, category: result.error.category }
          : null;
    const settled = { ...tracker, outcome };
    try {
      await this.deps.store.putTracker(run.target, settled);
    } catch {
      // No durable proof: show the server-confirmed result, but no cleanup and no ack. The next
      // drive re-reads the (unacknowledged) result and finishes then (05 OP-009, 06 §8.7).
      run.check();
      return run.setView(this.viewFor(settled, result, options));
    }
    run.check();
    return this.finalize(run, settled, result, options);
  }

  /**
   * Finishing stages in order, each confirmed before the next (06 §8.7): proof kept → drafts removed
   * → caches synced → payload removed → ack → tracker removed. A failed sensitive-record stage stops
   * here and keeps the tracker, so the next entry resumes; ack only after proof and cleanup (05 OP-009).
   */
  private async finalize(
    run: Run,
    tracker: AnswerWriteTracker,
    result: AnswerWriteResult | null,
    options: { quiet: boolean },
  ): Promise<void> {
    const outcome = tracker.outcome;
    if (!outcome) return;
    run.setView(this.viewFor(tracker, result, options));

    if (outcome.state === 'SUCCEEDED') {
      // New-save success removes every create draft of that daily SEMA (06 §7.1).
      try {
        await this.deps.drafts.removeAllForDailySema(run.target);
      } catch {
        return;
      }
      run.check();
      await this.deps.syncAfterSuccess(outcome.answerId).catch(() => undefined);
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
      // Ack failure never restores records or blocks the result; the proof is already on the device.
      await this.deps.session
        .run('ACTIVE', (auth) => this.deps.api.acknowledgeCommand(auth, ticketId))
        .catch(() => undefined);
      run.check();
    }
    await this.deps.store.removeTracker(run.target).catch(() => undefined);
  }

  private viewFor(
    tracker: AnswerWriteTracker,
    result: AnswerWriteResult | null,
    options: { quiet: boolean },
  ): WriteView {
    const outcome = tracker.outcome;
    if (!outcome || options.quiet) return IDLE_VIEW;
    if (outcome.state === 'NOT_APPLIED') return { kind: 'notApplied', code: outcome.code };
    const presentation: AnswerWritePresentation =
      result?.state === 'SUCCEEDED' ? result.presentation : { state: 'UNAVAILABLE', retryable: true };
    return { kind: 'succeeded', completion: { answerId: outcome.answerId, presentation } };
  }

  /** Authenticated prepare rejection: nothing was accepted, so the local command records go. */
  private async dropUnsent(run: Run): Promise<void> {
    try {
      await this.deps.store.removePayload(run.target);
      await this.deps.store.removeTracker(run.target);
    } catch {
      // A leftover unsent tracker is resumed (and rejected again) on the next entry.
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => this.timers.set(resolve, ms));
  }

  private setView(target: string, view: WriteView): void {
    this.views.set(target, view);
    this.emit(target, view);
  }

  private emit(target: string, view: WriteView): void {
    for (const listener of this.listeners.get(target) ?? []) listener(view);
  }
}
