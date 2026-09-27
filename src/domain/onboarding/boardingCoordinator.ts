import { z } from 'zod';
import type { ConsentReceipt, PassengerProfile } from '../../data/api/models.ts';
import { DomainFailure, LocalPersistenceFailure } from '../../data/failures.ts';
import type { StorageJournal } from '../../data/storage/journal.ts';
import type { LocalOwnerVerifier } from '../session/ownerVerifier.ts';
import type { SessionController } from '../session/sessionController.ts';

// F02 passenger creation (06 §9.1). The operation ID, exact consents and local owner verifier are
// stored and read back in the PRE area before OP-003 is sent; an unknown outcome keeps them so a retry
// resends the same ID and input. Only a definite rejection frees the ID for a new attempt.

const PRE_AREA = { kind: 'pre' } as const;
const TRACKER = 'createPassenger';

const zTracker = z.object({
  operationId: z.string().min(1),
  consents: z.array(z.object({ policyId: z.string().min(1), version: z.string().min(1) })).min(1),
  verifier: z.object({ salt: z.string().min(1), value: z.string().min(1) }).nullable(),
});
type Tracker = z.output<typeof zTracker>;

/** Rejections after which the server created nothing for this ID (05 §8.2). */
const DEFINITE_REJECTIONS = new Set(['CONSENT_REQUIRED', 'POLICY_VERSION_CHANGED', 'IDEMPOTENCY_KEY_REUSED']);

function newOperationId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  // No predictable fallback: an operation ID must be random (05 §9.2).
  if (!id) throw new LocalPersistenceFailure('write');
  return id;
}

function sameTracker(a: Tracker, b: unknown): boolean {
  const parsed = zTracker.safeParse(b);
  return parsed.success && JSON.stringify(parsed.data) === JSON.stringify(a);
}

export interface BoardingCoordinatorDeps {
  session: SessionController;
  journal: StorageJournal;
}

export class BoardingCoordinator {
  private readonly deps: BoardingCoordinatorDeps;
  private inFlight: Promise<PassengerProfile> | null = null;

  constructor(deps: BoardingCoordinatorDeps) {
    this.deps = deps;
  }

  /** Single-flight: a second tap while OP-003 is pending joins the same attempt (IX-031). */
  submit(consents: readonly ConsentReceipt[]): Promise<PassengerProfile> {
    this.inFlight ??= this.run(consents).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async run(consents: readonly ConsentReceipt[]): Promise<PassengerProfile> {
    const tracker = await this.trackerFor(consents);
    try {
      const { passenger } = await this.deps.session.createPassenger(
        tracker.operationId,
        tracker.consents,
        tracker.verifier,
      );
      return passenger;
    } catch (error) {
      if (error instanceof DomainFailure && DEFINITE_REJECTIONS.has(error.code)) {
        await this.deps.journal.removeRecord(PRE_AREA, TRACKER);
        // Latest policies come from a fresh OP-001; the screen re-reads them (05 §8.2).
        if (error.code === 'POLICY_VERSION_CHANGED') await this.deps.session.establish().catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * Cold start as ACTIVE with this device's creation tracker (response lost, app closed): true only
   * when the same ID's OP-003 receipt comes back, so F03 continues; a plain ACTIVE session never
   * counts as this creation's success (06 §9.1 #4). Without a verifier nothing is resent.
   */
  async resumeAsActive(): Promise<boolean> {
    const stored = zTracker.safeParse(await this.deps.journal.getRecord(PRE_AREA, TRACKER).catch(() => null));
    if (!stored.success || stored.data.verifier === null) return false;
    if (!(await this.deps.session.matchesLocalOwner(stored.data.verifier).catch(() => false))) return false;
    try {
      await this.deps.session.replayCreationAsActive(stored.data.operationId, stored.data.consents);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * An existing tracker for the same local owner is resent unchanged, whatever is selected now: its
   * outcome is still unknown. Without Web Crypto there is no verifier to prove the owner, so the
   * tracker is still kept rather than overwritten by a new ID; the controller then never resends it
   * automatically (06 §8.1). A tracker proven to belong to another key is replaced.
   */
  private async trackerFor(consents: readonly ConsentReceipt[]): Promise<Tracker> {
    await this.deps.journal.initArea(PRE_AREA);
    const stored = zTracker.safeParse(await this.deps.journal.getRecord(PRE_AREA, TRACKER));
    if (stored.success) {
      const { verifier } = stored.data;
      if (verifier === null || (await this.deps.session.matchesLocalOwner(verifier))) return stored.data;
    }
    const verifier: LocalOwnerVerifier | null = await this.deps.session.localOwnerVerifier();
    const tracker: Tracker = {
      operationId: newOperationId(),
      consents: consents.map((c) => ({ policyId: c.policyId, version: c.version })),
      verifier,
    };
    await this.deps.journal.putRecord(PRE_AREA, TRACKER, tracker);
    if (!sameTracker(tracker, await this.deps.journal.getRecord(PRE_AREA, TRACKER))) {
      throw new LocalPersistenceFailure('read-back');
    }
    return tracker;
  }
}
