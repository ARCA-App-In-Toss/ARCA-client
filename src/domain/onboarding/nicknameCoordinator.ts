import { z } from 'zod';
import type { ArcaApi } from '../../data/api/arcaApi.ts';
import { DomainFailure, LocalPersistenceFailure, TransportFailure } from '../../data/failures.ts';
import type { ManifestScope, StorageJournal } from '../../data/storage/journal.ts';
import type { NetworkPort } from '../../platform/ports.ts';
import type { SessionController } from '../session/sessionController.ts';

// OP-004 from F03 (06 §9.1, 04 IX-035). The operation ID, exact input and expected revision are stored
// and read back in the generation area before sending. An unknown outcome keeps them, and the same
// input is resent with the same key to restore the receipt; only a definite server answer frees it.

const TRACKER = 'setNickname';

const zTracker = z.object({
  operationId: z.string().min(1),
  nickname: z.string().nullable(),
  expectedRevision: z.string().min(1),
});
type Tracker = z.output<typeof zTracker>;

/**
 * - saved: the server applied this request (receipt).
 * - rejected: definite server refusal, nothing applied; the user may skip explicitly (IX-035).
 * - unsent: offline before reaching the server; the user may skip explicitly (IX-035).
 * - expired: the key's result retention ended; whether it applied is not guessed. The current profile
 *   is re-read and the next save is a new user action with a new key (IX-035, MS-NICK-002).
 * - unknown: the outcome is not confirmed; never treated as a failure that allows skipping.
 */
export type NicknameSaveResult = 'saved' | 'rejected' | 'unsent' | 'expired' | 'unknown';

export interface NicknameCoordinatorDeps {
  session: SessionController;
  api: ArcaApi;
  journal: StorageJournal;
  network: NetworkPort;
  area: () => ManifestScope | null;
  /** Current profile is re-read after a result; the receipt never overwrites it (05 §5.2). */
  syncProfile: () => Promise<void>;
}

function newOperationId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new LocalPersistenceFailure('write');
  return id;
}

export class NicknameCoordinator {
  private readonly deps: NicknameCoordinatorDeps;
  private inFlight: Promise<NicknameSaveResult> | null = null;

  constructor(deps: NicknameCoordinatorDeps) {
    this.deps = deps;
  }

  /** Single-flight; a second activation while saving joins the same request. */
  save(nickname: string, expectedRevision: string): Promise<NicknameSaveResult> {
    this.inFlight ??= this.run(nickname, expectedRevision).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async run(nickname: string, expectedRevision: string): Promise<NicknameSaveResult> {
    const area = this.deps.area();
    if (!area) return 'unknown';
    let tracker: Tracker;
    try {
      tracker = await this.trackerFor(area, nickname, expectedRevision);
    } catch {
      // Not stored and read back, so nothing was sent: a definite, skippable failure (06 §9.1).
      return 'rejected';
    }
    let result = await this.send(tracker);
    // One resend with the same key restores the receipt of a lost response (MS-NICK-002).
    if (result === 'unknown') result = await this.send(tracker);
    if (result === 'saved' || result === 'rejected' || result === 'expired') {
      // Cleanup never changes the server outcome already confirmed above.
      await this.deps.journal.removeRecord(area, TRACKER).catch(() => undefined);
      await this.deps.syncProfile().catch(() => undefined);
    }
    return result;
  }

  private async send(tracker: Tracker): Promise<NicknameSaveResult> {
    try {
      await this.deps.session.run('ACTIVE', (auth) =>
        this.deps.api.setNickname(auth, tracker.operationId, tracker.nickname, tracker.expectedRevision),
      );
      return 'saved';
    } catch (error) {
      if (error instanceof DomainFailure && error.code === 'OPERATION_RESULT_EXPIRED') return 'expired';
      if (error instanceof DomainFailure && error.category !== 'AUTH') return 'rejected';
      // A connection that never opened while the device reports offline did not reach the server.
      if (error instanceof TransportFailure && error.reason === 'network' && (await this.deps.network.isOffline())) {
        return 'unsent';
      }
      return 'unknown';
    }
  }

  /** The same input resumes its stored key; a different input starts a new request. */
  private async trackerFor(area: ManifestScope, nickname: string, expectedRevision: string): Promise<Tracker> {
    const stored = zTracker.safeParse(await this.deps.journal.getRecord(area, TRACKER));
    if (stored.success && stored.data.nickname === nickname) return stored.data;
    const tracker: Tracker = { operationId: newOperationId(), nickname, expectedRevision };
    await this.deps.journal.putRecord(area, TRACKER, tracker);
    const readBack = zTracker.safeParse(await this.deps.journal.getRecord(area, TRACKER));
    if (!readBack.success || JSON.stringify(readBack.data) !== JSON.stringify(tracker)) {
      throw new LocalPersistenceFailure('read-back');
    }
    return tracker;
  }
}
