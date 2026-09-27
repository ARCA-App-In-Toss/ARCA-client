import type { ArcaApi } from '../../data/api/arcaApi.ts';
import type {
  AnswerDeleteClosure,
  AnswerDeleteResult,
  AnswerWriteClosure,
  AnswerWritePresentation,
  AnswerWriteResult,
  PrepareAnswerDelete,
  PrepareAnswerWrite,
  Reconciliation,
} from '../../data/api/models.ts';
import { DomainFailure } from '../../data/failures.ts';
import { DRAFT_TTL_MS, type DraftRepository } from '../drafts/draftRepository.ts';
import type { Timers } from '../drafts/draftWriter.ts';
import type { SessionController } from '../session/sessionController.ts';
import type { AnswerPrepareInput, AnswerWriteStore, AnswerWriteTracker } from './answerWriteStore.ts';

// Answer command lifecycle (06 §8.3–8.7, §9.2, 05 OP-006~009·012): new save (CREATE), edit (UPDATE)
// and single delete (DELETE). Nothing goes on the network until the
// latest text, the tracker and the fixed payload are read back. Only an authenticated SUCCEEDED or
// NOT_APPLIED ends a command; timeouts, lost responses and unmounts never mean "not applied".
// Every run is bound to the owner/generation it started under and stops once that changes.

export const RESULT_CYCLE_MS = 10_000;
export const TRANSPORT_MAX_MS = 8_000;
/** OP-008 attempt offsets inside one foreground cycle (06 §8.5). */
export const RESULT_CHECK_OFFSETS_MS = [0, 1_000, 3_000, 7_000] as const;
export const COMPLETION_EXCERPT_PROFILE = 'COMPACT' as const;
/** Edit results are read with the F20 row profile so a confirmed row can be patched (06 §6.3). */
export const EDIT_EXCERPT_PROFILE = 'STANDARD' as const;
/** Fixed payload lifetime: the same 7 days from the last user edit as the draft (06 §8.6). */
export const PAYLOAD_TTL_MS = DRAFT_TTL_MS;

export interface Completion {
  answerId: string;
  presentation: AnswerWritePresentation;
}

export type WriteView =
  | { kind: 'idle' }
  /** Local pre-keeping, then network; `trackerKept` enables safe exit once the draft is kept too. */
  | { kind: 'working'; stage: 'keeping' | 'sending' | 'confirming'; trackerKept: boolean }
  /**
   * `recovery` names the user's explicit OP-015 action (04 IX-041, 06 §8.5): `closePrepared` when the
   * server holds a prepared request this device can no longer execute (payload missing or expired),
   * `cleanUpExpired` when the past result is no longer retained (CLOSED_OUTCOME_UNAVAILABLE).
   */
  | { kind: 'unconfirmed'; trackerKept: boolean; recovery?: 'closePrepared' | 'cleanUpExpired' }
  /** Sealed past command cleaned up; the server's current-state guidance, never a success claim. */
  | { kind: 'reconciled'; reconciliation: Reconciliation }
  | { kind: 'succeeded'; completion: Completion }
  /** Single delete confirmed (DELETED or ALREADY_ABSENT). */
  | { kind: 'deleted' }
  | { kind: 'notApplied'; code: string }
  /** Authenticated prepare rejection; no ticket was created. */
  | { kind: 'rejected'; code: string }
  /** Pre-keeping or tracker read failed; nothing was sent. */
  | { kind: 'localFailure' };

export type Unfinished =
  | { kind: 'unresolved'; mode: 'CREATE'; questionId: string }
  | { kind: 'unresolved'; mode: 'UPDATE' | 'DELETE' }
  | { kind: 'finishing' }
  | null;

/** Latest draft confirmed in Storage at flush time; the payload is built from exactly this. */
export interface KeptDraft {
  text: string;
  lastModifiedAt: number;
}

export interface SaveRequest {
  input: PrepareAnswerWrite;
  /** Flushes the open draft; the read-back text, or null when it could not be kept. */
  flushDraft(): Promise<KeptDraft | null>;
}

export interface DeleteRequest {
  input: PrepareAnswerDelete;
}

/** What the current-resource sync has to reflect after a settled or reconciled command (06 §6.4). */
export type SyncEvent =
  | { kind: 'created'; answerId: string }
  | {
      kind: 'updated';
      answerId: string;
      baseRevision: string;
      revision: string;
      /** The exact fixed payload that was applied, when still on the device. */
      content: string | null;
      ticketId: string | null;
    }
  | { kind: 'deleted'; answerId: string }
  /** NOT_APPLIED on an existing answer: the latest detail/list are read again. */
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
  /** The confirmed owner/generation right now, or null while none is confirmed. */
  fence: () => OwnerFence | null;
  timers?: Timers;
  newOperationId?: () => string;
  /** Current-resource sync after a result or reconciliation (today/archive caches); must be repeat-safe. */
  syncCurrentResources(event: SyncEvent): Promise<void>;
}

const realTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Shared idle snapshot: view reads must be referentially stable for subscribers. */
const IDLE_VIEW: WriteView = Object.freeze({ kind: 'idle' });

/** A tracker whose payload was never confirmed and that has no ticket: no mutation was sent (06 §8.3). */
function neverSent(tracker: AnswerWriteTracker): boolean {
  return tracker.ticketId === null && !tracker.networkAllowed;
}

type CommandResult = AnswerWriteResult | AnswerDeleteResult;

function isTerminal(result: CommandResult): boolean {
  return result.state === 'SUCCEEDED' || result.state === 'NOT_APPLIED';
}

/** The lock target of a prepare input: daily SEMA for a new save, answer for edit/delete (06 §4.3). */
export function targetOf(input: AnswerPrepareInput | PrepareAnswerWrite): string {
  return input.mode === 'CREATE' ? input.dailySemaId : input.answerId;
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
  /** Background: result-check timers stop; foreground/re-entry checks once again (06 §8.5 #6). */
  private suspended = false;
  private readonly sleepers = new Set<() => void>();
  /**
   * Tickets whose outcome was already shown in this app session. Showing is separate from local
   * finishing: a later re-read (e.g. after a failed proof write) finishes quietly (06 §8.7).
   */
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

  /** Owner/generation change or discard: drop every view and ignore all in-flight runs (06 §4.2). */
  reset(): void {
    this.epoch += 1;
    this.announced.clear();
    this.inFlight.clear();
    const targets = [...this.views.keys()];
    this.views.clear();
    for (const target of targets) this.emit(target, IDLE_VIEW);
  }

  /** App went to the background: stop waiting between result checks; nothing is judged from it. */
  suspend(): void {
    this.suspended = true;
    for (const wake of [...this.sleepers]) wake();
  }

  resume(): void {
    this.suspended = false;
  }

  /**
   * One bounded check per kept tracker, at most `concurrency` at a time, joining any running
   * single-flight (06 §5.3 #7, §8.5 #6). Never OP-015, never a new operation, never polling.
   */
  async recheckAll(options: { except?: string | null; concurrency?: number } = {}): Promise<void> {
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

  /** Clears a settled view once the screen has consumed it (visit feedback is separate from cleanup). */
  acknowledgeView(dailySemaId: string): void {
    const view = this.getView(dailySemaId);
    if (view.kind !== 'working') this.setView(dailySemaId, IDLE_VIEW);
  }

  /** Unresolved save (blocks new writes, 04 IX-036 #5) or unfinished local finishing, if any. */
  async unfinished(dailySemaId: string): Promise<Unfinished> {
    const tracker = await this.deps.store.getTracker(dailySemaId);
    if (!tracker) return null;
    if (tracker.outcome) return { kind: 'finishing' };
    const input = tracker.prepareInput;
    return input.mode === 'CREATE'
      ? { kind: 'unresolved', mode: 'CREATE', questionId: input.questionId }
      : { kind: 'unresolved', mode: input.mode };
  }

  /** User save. Single-flight per target; an unresolved tracker is resumed, never replaced. */
  save(request: SaveRequest): Promise<void> {
    const target = targetOf(request.input);
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
      if (existing && !neverSent(existing)) return this.drive(run, { quiet: false });

      // 06 §8.3: latest draft → tracker meta → fixed payload, each read back, before any mutation.
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
        // Nothing was sent; drop the partial tracker if possible so the next save starts clean.
        await this.deps.store.removeTracker(target).catch(() => undefined);
        return run.setView({ kind: 'localFailure' });
      }
      run.check();
      return this.drive(run, { quiet: false });
    });
  }

  /**
   * F23 delete (06 §9.2): the answer id, expected revision and operation id are kept and read back
   * before OP-012; nothing local (detail, row, edit drafts) goes before a terminal result.
   */
  delete(request: DeleteRequest): Promise<void> {
    const target = request.input.answerId;
    const running = this.inFlight.get(target);
    if (running) return running;
    this.setView(target, { kind: 'working', stage: 'keeping', trackerKept: false });
    return this.singleFlight(target, async (run) => {
      let existing: AnswerWriteTracker | null;
      try {
        existing = await this.deps.store.getTracker(target);
      } catch {
        return run.setView({ kind: 'localFailure' });
      }
      run.check();
      // An unresolved edit or delete of this answer holds the lock: resume it, never start another.
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

  /**
   * The user's explicit "이 저장 요청 끝내기" (04 IX-041). OP-015 is never called by a timer, an exit or
   * a background check. Only an authenticated NOT_APPLIED (or a race-winning SUCCEEDED) settles it;
   * EXECUTING, failures and COMMAND_NOT_FOUND keep the tracker and the result check (05 §6.10).
   */
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
      // Closing is not saving: show the result-check progress, never "saving" (04 IX-041).
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
      // EXECUTING keeps checking the result; it is never force-closed.
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
    if (neverSent(tracker)) {
      // Pre-keeping stopped before the payload was confirmed: nothing reached the server (06 §8.3).
      await this.dropUnsent(run);
      return run.setView(IDLE_VIEW);
    }
    run.setView({ kind: 'working', stage: 'sending', trackerKept: true });

    let result: CommandResult | null = null;
    let executed = false;

    if (tracker.ticketId === null) {
      // Prepare, or restore a lost prepare response with the same operation id and input (05 OP-006).
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
    /** 'unexecutable': the exact payload or the intent is gone; the prepared request waits for a close. */
    const isDelete = settledFrom.kind === 'ANSWER_DELETE';
    const execute = async (): Promise<CommandResult | 'unexecutable' | null> => {
      if (isDelete) {
        // A delete has no body: only the kept intent may run it (06 §9.2 #2).
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
        // 7 days after the last edit the text goes and auto-execution stops (06 §8.6).
        await this.deps.store.removePayload(target).catch(() => undefined);
        run.check();
        payload = null;
      }
      // Only the exact kept payload with the original intent may run (05 OP-006 re-entry rule).
      if (!payload || !settledFrom.executeIntent) return 'unexecutable';
      executed = true;
      try {
        return await this.deps.session.run('ACTIVE', (auth) =>
          this.deps.api.executeAnswerWrite(auth, ticketId, payload.content, budget()),
        );
      } catch {
        return null; // Unknown outcome: confirm with OP-008.
      }
    };

    const closable = () => run.setView({ kind: 'unconfirmed', trackerKept: true, recovery: 'closePrepared' });
    const sealed = () => run.setView({ kind: 'unconfirmed', trackerKept: true, recovery: 'cleanUpExpired' });
    // Restored prepare of a past command whose result is no longer retained (05 §8.3).
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
      // Backgrounded: stop here with the result still unknown; foreground checks again.
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
        // Past result no longer retained: neither success nor failure is claimed (05 §8.3).
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
        // Transport/protocol trouble on a safe query: try the next slot; never infer "not applied".
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
        // Drafts per kind (06 §7.1): a new save drops every create draft of the daily SEMA, an edit
        // only its answer/base-revision draft, a delete every edit draft of the answer.
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
      // The server copy stays; the latest detail is read again (06 §6.4 NOT_APPLIED, §9.2 #5).
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
      // Ack failure never restores records or blocks the result; the proof is already on the device.
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

  /**
   * OP-015 sealed the past command (no further execution possible) and reported the current state:
   * only now the tracker and any payload go. No ack (there is no retained result) and no success
   * notice; a current answer is synced so the next screen reads it fresh (04 IX-041).
   */
  private async reconcile(run: Run, reconciliation: Reconciliation): Promise<void> {
    try {
      await this.deps.store.removePayload(run.target);
      run.check();
      await this.deps.store.removeTracker(run.target);
    } catch (error) {
      if (error instanceof AbandonedRun) throw error;
      // A leftover tracker repeats the idempotent close on the next explicit action.
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

  /** Authenticated prepare rejection: nothing was accepted, so the local command records go. */
  private async dropUnsent(run: Run): Promise<void> {
    try {
      run.check();
      await this.deps.store.removePayload(run.target);
      run.check();
      await this.deps.store.removeTracker(run.target);
    } catch (error) {
      // A run whose owner/generation moved must not touch the records any further.
      if (error instanceof AbandonedRun) throw error;
      // A leftover unsent tracker is resumed (and rejected or dropped again) on the next entry.
    }
  }

  /**
   * Startup sweep (06 §8.6): payloads past 7 days from the last edit are removed; the non-text
   * tracker stays until a terminal result, an authenticated cleanup or an all-data delete. The
   * result lifetime never extends the text lifetime.
   */
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
      // A save may have replaced the operation while reading: remove only the one judged expired.
      const latest = await this.deps.store.getTracker(target).catch(() => null);
      if (latest?.operationId !== tracker.operationId || !same() || this.inFlight.has(target)) continue;
      await this.deps.store.removePayload(target).catch(() => undefined);
    }
  }

  private payloadExpired(lastModifiedAt: number): boolean {
    return this.deps.now() >= lastModifiedAt + PAYLOAD_TTL_MS;
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
