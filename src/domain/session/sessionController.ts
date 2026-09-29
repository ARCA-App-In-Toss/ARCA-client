import { DomainFailure, ProtocolFailure, TransportFailure } from '../failures.ts';
import type { ConsentReceipt, EstablishedSession, PassengerProfile, RecentDeletion, SessionMode } from '../models.ts';
import type { ArcaApi, Bearer } from '../ports/api.ts';
import type { ClockPort, IdentityPort } from '../ports/platform.ts';
import { digestOwner, type LocalOwnerVerifier, newSalt } from './ownerVerifier.ts';

export class IdentityUnavailableFailure extends Error {
  override readonly name = 'IdentityUnavailableFailure';
  readonly reason: string;
  constructor(reason: string) {
    super(`identity:${reason}`);
    this.reason = reason;
  }
}

export class SessionChangedFailure extends Error {
  override readonly name = 'SessionChangedFailure';
  constructor() {
    super('session:changed');
  }
}

export class StaleResultFailure extends Error {
  override readonly name = 'StaleResultFailure';
  declare readonly outcome: { kind: 'result'; value: unknown } | { kind: 'error'; error: unknown };
  constructor(outcome: StaleResultFailure['outcome']) {
    super('session:stale');
    Object.defineProperty(this, 'outcome', { value: outcome, enumerable: false });
  }
}

export class SessionModeMismatchFailure extends Error {
  override readonly name = 'SessionModeMismatchFailure';
  constructor() {
    super('session:mode');
  }
}

export interface RequestSnapshot {
  readonly ownerScope: string;
  readonly sessionEpoch: number;
  readonly dataGeneration: string | null;
  readonly mode: SessionMode;
}

export interface SessionSummary {
  readonly ownerScope: string;
  readonly mode: SessionMode;
  readonly epoch: number;
  readonly generation: string | null;
  readonly consentPolicyCount: number;
  readonly recentDeletion: RecentDeletion | null;
}

export type SessionEvent =
  | {
      kind: 'established';
      summary: SessionSummary;
      ownerChanged: boolean;
      boarded?: PassengerProfile;
    }
  | { kind: 'discarded' };

interface Current {
  summary: SessionSummary;
  token: string;
  expiresAtMs: number;
  receivedAtMs: number;
  ownerIdentity: string;
  session: EstablishedSession;
}

function creationOutcomeUnknown(error: unknown): boolean {
  if (error instanceof TransportFailure) return error.reason === 'network' || error.reason === 'timeout';
  if (error instanceof ProtocolFailure) return true;
  return error instanceof DomainFailure && error.category === 'AUTH';
}

let scopeSeq = 0;
function newOwnerScope(): string {
  scopeSeq += 1;
  return globalThis.crypto?.randomUUID?.() ?? `scope-${scopeSeq}-${Math.random().toString(36).slice(2)}`;
}

function ownerIdentityOf(session: EstablishedSession): string {
  const { context } = session;
  return context.mode === 'PRE_PASSENGER' ? 'PRE' : `G:${context.dataGeneration}`;
}

export interface SessionControllerDeps {
  api: ArcaApi;
  identity: IdentityPort;
  clock: ClockPort;
}

export class SessionController {
  private readonly deps: SessionControllerDeps;
  private current: Current | null = null;
  private inFlight: Promise<SessionSummary> | null = null;
  private epoch = 0;
  private readonly listeners = new Set<(event: SessionEvent) => void>();

  constructor(deps: SessionControllerDeps) {
    this.deps = deps;
  }

  get summary(): SessionSummary | null {
    return this.current?.summary ?? null;
  }

  get deletionTicketId(): string | null {
    const context = this.current?.session.context;
    return context?.mode === 'DELETION_RECOVERY' ? context.deletionTicketId : null;
  }

  get consentPolicies() {
    return this.current?.session.consentPolicies ?? [];
  }

  subscribe(listener: (event: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  establish(): Promise<SessionSummary> {
    this.inFlight ??= this.runEstablish().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  snapshot(): RequestSnapshot | null {
    const current = this.current;
    if (!current) return null;
    const { ownerScope, epoch, generation, mode } = current.summary;
    return { ownerScope, sessionEpoch: epoch, dataGeneration: generation, mode };
  }

  isCurrent(snapshot: RequestSnapshot): boolean {
    const now = this.snapshot();
    return (
      now !== null &&
      now.ownerScope === snapshot.ownerScope &&
      now.sessionEpoch === snapshot.sessionEpoch &&
      now.dataGeneration === snapshot.dataGeneration &&
      now.mode === snapshot.mode
    );
  }

  async localOwnerVerifier(): Promise<LocalOwnerVerifier | null> {
    const salt = newSalt();
    if (!salt) return null;
    const value = await digestOwner(salt, await this.requireKey());
    return value ? { salt, value } : null;
  }

  async matchesLocalOwner(verifier: LocalOwnerVerifier): Promise<boolean> {
    return (await digestOwner(verifier.salt, await this.requireKey())) === verifier.value;
  }

  async createPassenger(
    operationId: string,
    consents: readonly ConsentReceipt[],
    verifier: LocalOwnerVerifier | null,
  ): Promise<{ summary: SessionSummary; passenger: PassengerProfile }> {
    const current = this.current;
    if (current?.summary.mode !== 'PRE_PASSENGER') throw new SessionModeMismatchFailure();
    let created: Awaited<ReturnType<ArcaApi['createPassenger']>>;
    try {
      created = await this.deps.api.createPassenger({ bearer: current.token }, operationId, consents);
    } catch (error) {
      if (!creationOutcomeUnknown(error) || !verifier) throw error;
      const key = await this.requireKey();
      if ((await digestOwner(verifier.salt, key)) !== verifier.value) {
        await this.establish();
        throw new SessionChangedFailure();
      }
      const fresh = await this.deps.api.establishSession(key);
      if (fresh.context.mode === 'DELETION_RECOVERY') {
        this.apply(fresh);
        throw new SessionChangedFailure();
      }
      try {
        created = await this.deps.api.createPassenger({ bearer: fresh.accessToken }, operationId, consents);
      } catch (resendError) {
        if (fresh.context.mode === 'PRE_PASSENGER' || !creationOutcomeUnknown(resendError)) this.apply(fresh);
        throw resendError;
      }
    }
    return { summary: this.apply(created.session, created.passenger), passenger: created.passenger };
  }

  async replayCreationAsActive(operationId: string, consents: readonly ConsentReceipt[]): Promise<PassengerProfile> {
    const current = this.current;
    if (current?.summary.mode !== 'ACTIVE') throw new SessionModeMismatchFailure();
    const created = await this.deps.api.createPassenger({ bearer: current.token }, operationId, consents);
    const summary = this.apply(created.session, created.passenger);
    if (summary.ownerScope !== current.summary.ownerScope) throw new SessionChangedFailure();
    return created.passenger;
  }

  discard(): void {
    if (!this.current) return;
    this.current = null;
    this.emit({ kind: 'discarded' });
  }

  async run<T>(mode: SessionMode, call: (auth: Bearer, snapshot: RequestSnapshot) => Promise<T>): Promise<T> {
    const origin = this.requireSnapshot(mode);
    await this.refreshIfNearExpiry();
    let snapshot = this.requireSameOwner(origin, mode);
    try {
      return this.fenced(snapshot, await call({ bearer: this.requireToken() }, snapshot));
    } catch (error) {
      if (error instanceof StaleResultFailure) throw error;
      const recoverable =
        error instanceof DomainFailure && error.code === 'SESSION_RECOVERY_REQUIRED' && error.recoveryAllowed;
      if (!recoverable) this.fenceError(snapshot, error);
      try {
        await this.establish();
      } catch (establishError) {
        this.discard();
        throw establishError;
      }
      snapshot = this.requireSameOwner(origin, mode);
      try {
        return this.fenced(snapshot, await call({ bearer: this.requireToken() }, snapshot));
      } catch (replayError) {
        if (replayError instanceof StaleResultFailure) throw replayError;
        this.fenceError(snapshot, replayError);
      }
    }
  }

  private fenced<T>(snapshot: RequestSnapshot, value: T): T {
    if (!this.isCurrent(snapshot)) throw new StaleResultFailure({ kind: 'result', value });
    return value;
  }

  private fenceError(snapshot: RequestSnapshot, error: unknown): never {
    if (!this.isCurrent(snapshot)) throw new StaleResultFailure({ kind: 'error', error });
    throw error;
  }

  private requireSameOwner(origin: RequestSnapshot, mode: SessionMode): RequestSnapshot {
    const now = this.snapshot();
    if (!now || now.ownerScope !== origin.ownerScope || now.dataGeneration !== origin.dataGeneration) {
      throw new SessionChangedFailure();
    }
    return this.requireSnapshot(mode);
  }

  private requireSnapshot(mode: SessionMode): RequestSnapshot {
    const snapshot = this.snapshot();
    if (!snapshot || snapshot.mode !== mode) throw new SessionModeMismatchFailure();
    return snapshot;
  }

  private requireToken(): string {
    if (!this.current) throw new SessionModeMismatchFailure();
    return this.current.token;
  }

  refreshOnForeground(): Promise<void> {
    return this.refreshIfNearExpiry();
  }

  private async refreshIfNearExpiry(): Promise<void> {
    const current = this.current;
    if (!current) return;
    const ttl = current.expiresAtMs - current.receivedAtMs;
    if (!Number.isFinite(ttl) || ttl <= 0) return;
    const margin = Math.min(60_000, ttl * 0.1);
    if (this.deps.clock.now() >= current.expiresAtMs - margin) await this.establish();
  }

  private async runEstablish(): Promise<SessionSummary> {
    const key = await this.requireKey();
    return this.apply(await this.deps.api.establishSession(key));
  }

  private async requireKey(): Promise<string> {
    const key = await this.deps.identity.getAnonymousKey();
    if (key.kind !== 'ok') throw new IdentityUnavailableFailure(key.reason);
    return key.key;
  }

  private apply(session: EstablishedSession, boarded?: PassengerProfile): SessionSummary {
    const ownerIdentity = ownerIdentityOf(session);
    const previous = this.current;
    const ownerChanged = previous === null || previous.ownerIdentity !== ownerIdentity;
    const { context } = session;

    this.epoch += 1;
    const summary: SessionSummary = {
      ownerScope: ownerChanged || !previous ? newOwnerScope() : previous.summary.ownerScope,
      mode: context.mode,
      epoch: this.epoch,
      generation: context.mode === 'PRE_PASSENGER' ? null : context.dataGeneration,
      consentPolicyCount: session.consentPolicies.length,
      recentDeletion: session.recentDeletion,
    };
    const expiresAtMs = Date.parse(session.expiresAt);
    this.current = {
      summary,
      token: session.accessToken,
      expiresAtMs,
      receivedAtMs: this.deps.clock.now(),
      ownerIdentity,
      session,
    };
    this.emit(
      boarded
        ? { kind: 'established', summary, ownerChanged, boarded }
        : { kind: 'established', summary, ownerChanged },
    );
    return summary;
  }

  private emit(event: SessionEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
