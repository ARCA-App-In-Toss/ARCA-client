import { z } from 'zod';
import { LocalPersistenceFailure } from '../../data/failures.ts';
import type { ManifestScope, StorageJournal } from '../../data/storage/journal.ts';
import type { ClockPort } from '../../platform/ports.ts';

// Device drafts (06 §7.1, §7.4). Identity uses server ids only, never question or answer text.
// A draft counts as kept only after the exact serialized value is read back from Storage.

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export interface CreateDraftIdentity {
  kind: 'create';
  dailySemaId: string;
  semaId: string;
  semaVersion: string;
  questionId: string;
  questionVersion: string;
}

export type DraftIdentity = CreateDraftIdentity;

export interface Draft {
  identity: DraftIdentity;
  text: string;
  /** Only user edits move this; opening or repair does not extend the 7-day window. */
  lastModifiedAt: number;
  expiresAt: number;
}

const zDraftRecord = z.object({
  recordType: z.literal('draft'),
  identity: z.object({
    kind: z.literal('create'),
    dailySemaId: z.string().min(1),
    semaId: z.string().min(1),
    semaVersion: z.string().min(1),
    questionId: z.string().min(1),
    questionVersion: z.string().min(1),
  }),
  text: z.string(),
  lastModifiedAt: z.number(),
});

export function draftName(identity: DraftIdentity): string {
  return `draft:create:${identity.dailySemaId}:${identity.semaId}@${identity.semaVersion}:${identity.questionId}@${identity.questionVersion}`;
}

function sameIdentity(a: DraftIdentity, b: DraftIdentity): boolean {
  return draftName(a) === draftName(b);
}

export class DraftRepository {
  private readonly journal: StorageJournal;
  private readonly clock: ClockPort;
  private readonly area: () => ManifestScope | null;
  private lastObservedAt = 0;

  constructor(deps: { journal: StorageJournal; clock: ClockPort; area: () => ManifestScope | null }) {
    this.journal = deps.journal;
    this.clock = deps.clock;
    this.area = deps.area;
  }

  /** Device time clamped so a backwards clock never expires drafts early (06 §7.4). */
  now(): number {
    this.lastObservedAt = Math.max(this.lastObservedAt, this.clock.now());
    return this.lastObservedAt;
  }

  private requireArea(): ManifestScope {
    const area = this.area();
    if (!area) throw new LocalPersistenceFailure('unreadable');
    return area;
  }

  /** Loads a live draft; an expired one is removed and reported as absent. Corruption is an error. */
  async load(identity: DraftIdentity): Promise<Draft | null> {
    const area = this.requireArea();
    const raw = await this.journal.getRecord(area, draftName(identity));
    if (raw === null) return null;
    const parsed = zDraftRecord.safeParse(raw);
    if (!parsed.success || !sameIdentity(parsed.data.identity, identity)) {
      throw new LocalPersistenceFailure('corrupt');
    }
    const lastModifiedAt = parsed.data.lastModifiedAt;
    const expiresAt = lastModifiedAt + DRAFT_TTL_MS;
    if (this.now() >= expiresAt) {
      await this.journal.removeRecord(area, draftName(identity));
      return null;
    }
    return { identity, text: parsed.data.text, lastModifiedAt, expiresAt };
  }

  /** Writes and confirms by exact read-back (journal.putRecord); resolves only when kept. */
  async save(identity: DraftIdentity, text: string, lastModifiedAt: number): Promise<void> {
    const area = this.requireArea();
    await this.journal.putRecord(area, draftName(identity), {
      recordType: 'draft',
      identity,
      text,
      lastModifiedAt,
    } satisfies z.input<typeof zDraftRecord>);
  }

  async remove(identity: DraftIdentity): Promise<void> {
    await this.journal.removeRecord(this.requireArea(), draftName(identity));
  }

  /** New-save success removes every create draft of that daily SEMA, old content included (06 §7.1). */
  async removeAllForDailySema(dailySemaId: string): Promise<void> {
    const area = this.requireArea();
    const manifest = await this.journal.readManifest(area);
    const prefix = `draft:create:${dailySemaId}:`;
    for (const name of Object.keys(manifest?.entries ?? {})) {
      if (name.startsWith(prefix)) await this.journal.removeRecord(area, name);
    }
  }
}
