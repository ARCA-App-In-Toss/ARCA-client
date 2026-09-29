import { z } from 'zod';
import { DomainFailure, LocalPersistenceFailure } from '../failures.ts';
import type { ConsentReceipt, PassengerProfile } from '../models.ts';
import type { JournalPort } from '../ports/storage.ts';
import type { LocalOwnerVerifier } from '../session/ownerVerifier.ts';
import type { SessionController } from '../session/sessionController.ts';

const PRE_AREA = { kind: 'pre' } as const;
const TRACKER = 'createPassenger';

const zTracker = z.object({
  operationId: z.string().min(1),
  consents: z.array(z.object({ policyId: z.string().min(1), version: z.string().min(1) })).min(1),
  verifier: z.object({ salt: z.string().min(1), value: z.string().min(1) }).nullable(),
});
type Tracker = z.output<typeof zTracker>;

const DEFINITE_REJECTIONS = new Set(['CONSENT_REQUIRED', 'POLICY_VERSION_CHANGED', 'IDEMPOTENCY_KEY_REUSED']);

function newOperationId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new LocalPersistenceFailure('write');
  return id;
}

function sameTracker(a: Tracker, b: unknown): boolean {
  const parsed = zTracker.safeParse(b);
  return parsed.success && JSON.stringify(parsed.data) === JSON.stringify(a);
}

export interface BoardingCoordinatorDeps {
  session: SessionController;
  journal: JournalPort;
}

export class BoardingCoordinator {
  private readonly deps: BoardingCoordinatorDeps;
  private inFlight: Promise<PassengerProfile> | null = null;

  constructor(deps: BoardingCoordinatorDeps) {
    this.deps = deps;
  }

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
        if (error.code === 'POLICY_VERSION_CHANGED') await this.deps.session.establish().catch(() => undefined);
      }
      throw error;
    }
  }

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
