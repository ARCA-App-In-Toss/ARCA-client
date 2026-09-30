import type { Timers } from '../drafts/draftWriter.ts';
import { DomainFailure, ProtocolFailure } from '../failures.ts';
import type { ArcaApi } from '../ports/api.ts';
import type { ClockPort } from '../ports/platform.ts';
import type { SessionController } from '../session/sessionController.ts';
import type { ProductEvent, RecordedProductEvent } from './productEvent.ts';

export const MAX_QUEUED_EVENTS = 100;
export const MAX_BATCH_EVENTS = 20;
export const RETRY_DELAYS_MS: readonly number[] = [2_000, 8_000, 30_000];

const realTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface Queued {
  recorded: RecordedProductEvent;
  generation: string | null;
}

export interface AnalyticsQueueDeps {
  session: Pick<SessionController, 'run' | 'snapshot' | 'subscribe'>;
  api: Pick<ArcaApi, 'submitProductEvents'>;
  clock: ClockPort;
  appVersion?: string;
  newEventId?: () => string;
  timers?: Timers;
}

function rejectedForGood(error: unknown): boolean {
  if (error instanceof ProtocolFailure) return error.reason === 'schema';
  return error instanceof DomainFailure && error.category === 'VALIDATION';
}

export class AnalyticsQueue {
  private readonly deps: AnalyticsQueueDeps;
  private readonly timers: Timers;
  private queue: Queued[] = [];
  private readonly recordedKeys = new Set<string>();
  private generation: string | null | undefined;
  private flushing: Promise<void> | null = null;
  private retries = 0;
  private retryHandle: unknown = null;
  private discardSeq = 0;

  constructor(deps: AnalyticsQueueDeps) {
    this.deps = deps;
    this.timers = deps.timers ?? realTimers;
    deps.session.subscribe((event) => {
      if (event.kind === 'established') this.follow(event.summary.generation);
    });
  }

  get pending(): number {
    return this.queue.length;
  }

  record(event: ProductEvent): boolean {
    const snapshot = this.deps.session.snapshot();
    if (!snapshot || snapshot.mode === 'DELETION_RECOVERY') return false;
    this.follow(snapshot.dataGeneration);
    const recorded: RecordedProductEvent = {
      ...event,
      eventId: this.deps.newEventId?.() ?? crypto.randomUUID(),
      occurredAt: new Date(this.deps.clock.now()).toISOString(),
    };
    this.queue.push({ recorded, generation: snapshot.dataGeneration });
    this.trim();
    if (this.queue.length >= MAX_BATCH_EVENTS) void this.flush();
    return true;
  }

  recordOnce(key: string, event: ProductEvent): void {
    if (this.recordedKeys.has(key)) return;
    if (this.record(event)) this.recordedKeys.add(key);
  }

  hint(): void {
    this.retries = 0;
    this.cancelRetry();
    void this.flush();
  }

  flush(): Promise<void> {
    this.flushing ??= this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  discardAll(): void {
    this.queue = [];
    this.recordedKeys.clear();
    this.discardSeq += 1;
    this.retries = 0;
    this.cancelRetry();
  }

  private follow(generation: string | null): void {
    const previous = this.generation;
    this.generation = generation;
    if (previous === undefined || previous === generation) return;
    this.recordedKeys.clear();
    this.queue = this.queue.filter((queued) => this.belongs(queued));
  }

  private belongs(queued: Queued): boolean {
    return queued.generation === null || queued.generation === this.generation;
  }

  private trim(): void {
    if (this.queue.length > MAX_QUEUED_EVENTS) this.queue.splice(0, this.queue.length - MAX_QUEUED_EVENTS);
  }

  private async drain(): Promise<void> {
    for (;;) {
      const snapshot = this.deps.session.snapshot();
      if (!snapshot || snapshot.mode === 'DELETION_RECOVERY') return;
      this.follow(snapshot.dataGeneration);
      const batch = this.take();
      if (batch.length === 0) return;
      const seq = this.discardSeq;
      const { appVersion } = this.deps;
      try {
        await this.deps.session.run(snapshot.mode, (auth) =>
          this.deps.api.submitProductEvents(auth, {
            events: batch.map((queued) => queued.recorded),
            ...(appVersion ? { appVersion } : {}),
          }),
        );
        this.retries = 0;
      } catch (error) {
        if (rejectedForGood(error)) continue;
        if (seq === this.discardSeq) this.putBack(batch);
        this.scheduleRetry();
        return;
      }
    }
  }

  private take(): Queued[] {
    const batch: Queued[] = [];
    const rest: Queued[] = [];
    for (const queued of this.queue) {
      if (batch.length < MAX_BATCH_EVENTS && this.belongs(queued)) batch.push(queued);
      else rest.push(queued);
    }
    this.queue = rest;
    return batch;
  }

  private putBack(batch: Queued[]): void {
    this.queue = [...batch.filter((queued) => this.belongs(queued)), ...this.queue];
    this.trim();
  }

  private scheduleRetry(): void {
    const delay = RETRY_DELAYS_MS[this.retries];
    if (delay === undefined || this.retryHandle !== null) return;
    this.retries += 1;
    this.retryHandle = this.timers.set(() => {
      this.retryHandle = null;
      void this.flush();
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryHandle === null) return;
    this.timers.clear(this.retryHandle);
    this.retryHandle = null;
  }
}
