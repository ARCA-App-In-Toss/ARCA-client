import type { DraftContext, DraftIdentity, DraftRepository } from './draftRepository.ts';

export const TRAILING_MS = 500;
export const MAX_WAIT_MS = 2_000;

export type KeepStatus =
  | { kind: 'clean' }
  | { kind: 'editing'; editVersion: number }
  | { kind: 'persisting'; editVersion: number }
  | { kind: 'persisted'; editVersion: number }
  | { kind: 'failed'; editVersion: number };

export interface Timers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface DraftWriterOptions {
  repository: DraftRepository;
  identity: DraftIdentity;
  initialText: string;
  initialLastModifiedAt: number | null;
  onStatus?: (status: KeepStatus) => void;
  timers?: Timers;
  context?: DraftContext;
}

export class DraftWriter {
  private readonly repository: DraftRepository;
  private readonly identity: DraftIdentity;
  private readonly context: DraftContext | undefined;
  private readonly timers: Timers;
  private readonly onStatus: (status: KeepStatus) => void;

  private text: string;
  private lastModifiedAt: number | null;
  private editVersion = 0;
  private confirmedVersion = 0;
  private failedVersion: number | null = null;
  private composing = false;
  private due = false;
  private trailing: unknown = null;
  private maxWait: unknown = null;
  private writing: Promise<void> | null = null;
  private writeAgain = false;
  private disposed = false;

  constructor(options: DraftWriterOptions) {
    this.repository = options.repository;
    this.identity = options.identity;
    this.context = options.context;
    this.timers = options.timers ?? realTimers;
    this.onStatus = options.onStatus ?? (() => undefined);
    this.text = options.initialText;
    this.lastModifiedAt = options.initialLastModifiedAt;
  }

  get currentText(): string {
    return this.text;
  }

  get status(): KeepStatus {
    if (this.editVersion === 0) return { kind: 'clean' };
    if (this.writing) return { kind: 'persisting', editVersion: this.editVersion };
    if (this.confirmedVersion === this.editVersion) return { kind: 'persisted', editVersion: this.editVersion };
    if (this.failedVersion !== null) return { kind: 'failed', editVersion: this.editVersion };
    return { kind: 'editing', editVersion: this.editVersion };
  }

  get isKept(): boolean {
    return this.editVersion === this.confirmedVersion;
  }

  change(text: string, composing: boolean): void {
    if (this.disposed) return;
    this.composing = composing;
    if (text === this.text) return;
    this.text = text;
    this.lastModifiedAt = this.repository.now();
    this.editVersion += 1;
    this.failedVersion = null;

    if (this.maxWait === null) this.maxWait = this.timers.set(() => this.onDeadline(), MAX_WAIT_MS);
    if (this.trailing !== null) this.timers.clear(this.trailing);
    this.trailing = this.timers.set(() => this.onDeadline(), TRAILING_MS);
    this.emit();
  }

  compositionEnd(text: string): void {
    this.change(text, false);
    this.composing = false;
    if (this.due) this.startWrite();
  }

  async flush(): Promise<boolean> {
    this.clearTimers();
    if (this.isKept) return true;
    this.startWrite();
    while (this.writing) await this.writing;
    return this.isKept;
  }

  async flushKept(): Promise<{ text: string; lastModifiedAt: number } | null> {
    if (!(await this.flush())) return null;
    return { text: this.text, lastModifiedAt: this.lastModifiedAt ?? this.repository.now() };
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
  }

  private onDeadline(): void {
    this.due = true;
    if (this.composing) return;
    this.startWrite();
  }

  private clearTimers(): void {
    if (this.trailing !== null) this.timers.clear(this.trailing);
    if (this.maxWait !== null) this.timers.clear(this.maxWait);
    this.trailing = null;
    this.maxWait = null;
  }

  private startWrite(): void {
    this.clearTimers();
    this.due = false;
    if (this.writing) {
      this.writeAgain = true;
      return;
    }
    this.writing = this.writeLoop().finally(() => {
      this.writing = null;
      this.emit();
    });
    this.emit();
  }

  private async writeLoop(): Promise<void> {
    do {
      this.writeAgain = false;
      const version = this.editVersion;
      const text = this.text;
      const lastModifiedAt = this.lastModifiedAt ?? this.repository.now();
      try {
        if (text === '') await this.repository.remove(this.identity);
        else await this.repository.save(this.identity, text, lastModifiedAt, this.context);
        this.confirmedVersion = Math.max(this.confirmedVersion, version);
        if (this.failedVersion !== null && this.failedVersion <= version) this.failedVersion = null;
      } catch {
        this.failedVersion = version;
        return;
      }
    } while (this.writeAgain && this.editVersion !== this.confirmedVersion);
  }

  private emit(): void {
    if (!this.disposed) this.onStatus(this.status);
  }
}
