import { z } from 'zod';
import { LocalPersistenceFailure } from '../../data/failures.ts';
import type { ManifestScope, StorageJournal } from '../../data/storage/journal.ts';

// Durable tracker and fixed payload for one answer-write target (06 §8.3–8.6). Every put resolves
// only after exact read-back, so "kept" is never claimed early.

const zPrepareInput = z.object({
  mode: z.literal('CREATE'),
  dailySemaId: z.string().min(1),
  semaId: z.string().min(1),
  semaVersion: z.string().min(1),
  questionId: z.string().min(1),
  questionVersion: z.string().min(1),
});

const zTracker = z.object({
  recordType: z.literal('command'),
  kind: z.literal('ANSWER_WRITE'),
  operationId: z.string().min(1),
  prepareInput: zPrepareInput,
  executeIntent: z.boolean(),
  ticketId: z.string().min(1).nullable(),
  outcome: z
    .union([
      z.object({ state: z.literal('SUCCEEDED'), answerId: z.string(), revision: z.string() }),
      z.object({ state: z.literal('NOT_APPLIED'), code: z.string(), category: z.string() }),
    ])
    .nullable(),
  createdAt: z.number(),
});

const zPayload = z.object({
  recordType: z.literal('command-payload'),
  operationId: z.string().min(1),
  content: z.string(),
  lastModifiedAt: z.number(),
});

export type AnswerWriteTracker = z.output<typeof zTracker>;
export type AnswerWritePayload = z.output<typeof zPayload>;

const trackerName = (dailySemaId: string) => `cmd:write:create:${dailySemaId}`;
const payloadName = (dailySemaId: string) => `cmd-payload:write:create:${dailySemaId}`;

export class AnswerWriteStore {
  private readonly journal: StorageJournal;
  private readonly area: () => ManifestScope | null;

  constructor(deps: { journal: StorageJournal; area: () => ManifestScope | null }) {
    this.journal = deps.journal;
    this.area = deps.area;
  }

  private requireArea(): ManifestScope {
    const area = this.area();
    if (!area) throw new LocalPersistenceFailure('unreadable');
    return area;
  }

  async getTracker(dailySemaId: string): Promise<AnswerWriteTracker | null> {
    const raw = await this.journal.getRecord(this.requireArea(), trackerName(dailySemaId));
    if (raw === null) return null;
    const parsed = zTracker.safeParse(raw);
    if (!parsed.success) throw new LocalPersistenceFailure('corrupt');
    return parsed.data;
  }

  putTracker(dailySemaId: string, tracker: AnswerWriteTracker): Promise<void> {
    return this.journal.putRecord(this.requireArea(), trackerName(dailySemaId), tracker);
  }

  removeTracker(dailySemaId: string): Promise<void> {
    return this.journal.removeRecord(this.requireArea(), trackerName(dailySemaId));
  }

  /** The exact payload for `operationId`, or null if it is missing or belongs to another operation. */
  async getPayload(dailySemaId: string, operationId: string): Promise<AnswerWritePayload | null> {
    const raw = await this.journal.getRecord(this.requireArea(), payloadName(dailySemaId));
    if (raw === null) return null;
    const parsed = zPayload.safeParse(raw);
    if (!parsed.success) throw new LocalPersistenceFailure('corrupt');
    return parsed.data.operationId === operationId ? parsed.data : null;
  }

  putPayload(dailySemaId: string, payload: AnswerWritePayload): Promise<void> {
    return this.journal.putRecord(this.requireArea(), payloadName(dailySemaId), payload);
  }

  removePayload(dailySemaId: string): Promise<void> {
    return this.journal.removeRecord(this.requireArea(), payloadName(dailySemaId));
  }
}
