import type { ArcaApi, Bearer } from '../../data/api/arcaApi.ts';
import type {
  ConsentReceipt,
  EstablishedSession,
  PassengerProfile,
  RecentDeletion,
  SessionMode,
} from '../../data/api/models.ts';
import { DomainFailure, ProtocolFailure, TransportFailure } from '../../data/failures.ts';
import type { ClockPort, IdentityPort } from '../../platform/ports.ts';
import { digestOwner, type LocalOwnerVerifier, newSalt } from './ownerVerifier.ts';

// Owns OP-001, the access token and the {ownerScope, epoch, generation} fence (06 §4.2, §5.4).
// The token never leaves this module except as the bearer handed to a single ArcaApi call.

export class IdentityUnavailableFailure extends Error {
  override readonly name = 'IdentityUnavailableFailure';
  readonly reason: string;
  constructor(reason: string) {
    super(`identity:${reason}`);
    this.reason = reason;
  }
}

/** Re-establishment changed owner, mode or generation; the old request must not be replayed. */
export class SessionChangedFailure extends Error {
  override readonly name = 'SessionChangedFailure';
  constructor() {
    super('session:changed');
  }
}

/**
 * A response arrived for an older epoch/generation/owner and must not be applied to current state.
 * The original outcome is kept so command code can still record a terminal result or keep the
 * outcome unconfirmed instead of treating staleness as "not applied" (05 §8.3).
 */
export class StaleResultFailure extends Error {
  override readonly name = 'StaleResultFailure';
  declare readonly outcome: { kind: 'result'; value: unknown } | { kind: 'error'; error: unknown };
  constructor(outcome: StaleResultFailure['outcome']) {
    super('session:stale');
    // Non-enumerable: the outcome may hold private content and must never be serialized (06 §10.4).
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
  /** Random in-memory ref for the confirmed owner; contains no key, token or passenger code (06 §6.1). */
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
      /** Set only when this session came from this visit's OP-003 response (06 §9.1 #3–4). */
      boarded?: PassengerProfile;
    }
  | { kind: 'discarded' };

interface Current {
  summary: SessionSummary;
  token: string;
  expiresAtMs: number;
  receivedAtMs: number;
  /** In-memory owner comparison only; never exposed or persisted. */
  ownerIdentity: string;
  session: EstablishedSession;
}

/**
 * OP-003 outcome is unknown: no response, an unreadable one, or the session was rejected before the
 * server could answer for this attempt. None of these means "not created" (05 §8.3).
 */
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
  return context.mode === 'PRE_PASSENGER' ? 'PRE' : `${context.mode}:${context.dataGeneration}`;
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

  /** Policies from the latest OP-001, for onboarding only. */
  get consentPolicies() {
    return this.current?.session.consentPolicies ?? [];
  }

  subscribe(listener: (event: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** OP-001 single-flight: every caller shares the same Promise (06 §5.4). */
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

  /** A fresh verifier for the current key, or null without Web Crypto (06 §8.1). */
  async localOwnerVerifier(): Promise<LocalOwnerVerifier | null> {
    const salt = newSalt();
    if (!salt) return null;
    const value = await digestOwner(salt, await this.requireKey());
    return value ? { salt, value } : null;
  }

  /** True only when the current platform key hashes to the stored verifier. */
  async matchesLocalOwner(verifier: LocalOwnerVerifier): Promise<boolean> {
    return (await digestOwner(verifier.salt, await this.requireKey())) === verifier.value;
  }

  /**
   * OP-003 with the stored operation ID and consents (06 §9.1). The ACTIVE session in the response
   * replaces the PRE one. If the outcome is unknown, OP-001 is re-exchanged and the same ID/input is
   * resent once, but only when the verifier proves the key is unchanged; without a verifier nothing is
   * resent automatically. A plain ACTIVE exchange is never treated as this creation's success: only
   * the OP-003 response for the same ID completes the handoff.
   */
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
        // A PRE refresh is the same owner. An ACTIVE session without this ID's receipt is applied only
        // on a definite answer, so it goes through normal start instead of a creation success.
        if (fresh.context.mode === 'PRE_PASSENGER' || !creationOutcomeUnknown(resendError)) this.apply(fresh);
        throw resendError;
      }
    }
    return { summary: this.apply(created.session, created.passenger), passenger: created.passenger };
  }

  /** Drop the token (reload, long background, full deletion success). */
  discard(): void {
    if (!this.current) return;
    this.current = null;
    this.emit({ kind: 'discarded' });
  }

  /**
   * Runs one authorized call in `mode`. A server-declared recoverable session error re-establishes once
   * and replays once only when owner/mode/generation are unchanged (05 §6.1 #6, 06 §5.4). Any
   * re-establishment that changes owner or generation (recovery or proactive refresh) aborts the call
   * with SessionChangedFailure; the outcome is returned only if the fence still matches.
   */
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
        // Owner could not be confirmed: private screens close and memory is dropped (06 §5.4).
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

  /** Proactive margin min(60s, 10% of observed TTL); device time is only a hint (06 §5.4). */
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

  /** No OP-001, random id or local fallback when the platform key is unavailable (05 §6.1 #1). */
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
