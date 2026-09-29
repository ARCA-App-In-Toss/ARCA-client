import { z } from 'zod';
import { DomainFailure, LocalPersistenceFailure, TransportFailure } from '../failures.ts';
import type { ArcaApi } from '../ports/api.ts';
import type { NetworkPort } from '../ports/platform.ts';
import type { JournalPort, ManifestScope } from '../ports/storage.ts';
import type { SessionController } from '../session/sessionController.ts';

const TRACKER = 'setNickname';

const zTracker = z.object({
  operationId: z.string().min(1),
  nickname: z.string().nullable(),
  expectedRevision: z.string().min(1),
});
type Tracker = z.output<typeof zTracker>;

export type NicknameSaveResult = 'saved' | 'rejected' | 'unsent' | 'expired' | 'unknown';

export interface NicknameCoordinatorDeps {
  session: SessionController;
  api: ArcaApi;
  journal: JournalPort;
  network: NetworkPort;
  area: () => ManifestScope | null;
  syncProfile: () => Promise<void>;
  deletionFenced?: () => boolean;
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

  save(nickname: string | null, expectedRevision: string): Promise<NicknameSaveResult> {
    if (!this.inFlight && this.deps.deletionFenced?.()) return Promise.resolve('rejected');
    this.inFlight ??= this.run(nickname, expectedRevision).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async resume(): Promise<void> {
    if (this.inFlight || this.deps.deletionFenced?.()) return;
    const area = this.deps.area();
    if (!area) return;
    const stored = zTracker.safeParse(await this.deps.journal.getRecord(area, TRACKER).catch(() => null));
    if (!stored.success) return;
    const tracker = stored.data;
    if (this.deps.area() !== area) return;
    this.inFlight = (async (): Promise<NicknameSaveResult> => {
      const result = await this.send(tracker, () => this.deps.area() === area);
      if ((result === 'saved' || result === 'rejected' || result === 'expired') && this.deps.area() === area) {
        await this.deps.journal.removeRecord(area, TRACKER).catch(() => undefined);
        await this.deps.syncProfile().catch(() => undefined);
      }
      return result;
    })().finally(() => {
      this.inFlight = null;
    });
    await this.inFlight;
  }

  async hasUnresolved(): Promise<boolean> {
    if (this.inFlight) return true;
    const area = this.deps.area();
    if (!area) return false;
    try {
      return (await this.deps.journal.getRecord(area, TRACKER)) !== null;
    } catch {
      return true;
    }
  }

  private async run(nickname: string | null, expectedRevision: string): Promise<NicknameSaveResult> {
    const area = this.deps.area();
    if (!area) return 'unknown';
    let tracker: Tracker;
    try {
      tracker = await this.trackerFor(area, nickname, expectedRevision);
    } catch {
      return 'rejected';
    }
    const sameArea = () => this.deps.area() === area;
    let result = await this.send(tracker, sameArea);
    if (result === 'unknown') result = await this.send(tracker, sameArea);
    if (result === 'saved' || result === 'rejected' || result === 'expired') {
      await this.deps.journal.removeRecord(area, TRACKER).catch(() => undefined);
      await this.deps.syncProfile().catch(() => undefined);
    }
    return result;
  }

  private async send(tracker: Tracker, current: () => boolean): Promise<NicknameSaveResult> {
    if (!current()) return 'unknown';
    try {
      await this.deps.session.run('ACTIVE', (auth) =>
        this.deps.api.setNickname(auth, tracker.operationId, tracker.nickname, tracker.expectedRevision),
      );
      return 'saved';
    } catch (error) {
      if (error instanceof DomainFailure && error.code === 'OPERATION_RESULT_EXPIRED') return 'expired';
      if (error instanceof DomainFailure && error.category !== 'AUTH') return 'rejected';
      if (error instanceof TransportFailure && error.reason === 'network' && (await this.deps.network.isOffline())) {
        return 'unsent';
      }
      return 'unknown';
    }
  }

  private async trackerFor(area: ManifestScope, nickname: string | null, expectedRevision: string): Promise<Tracker> {
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
