import { z } from 'zod';
import { LocalPersistenceFailure } from '../failures.ts';
import type { JournalPort, ManifestScope } from '../ports/storage.ts';

const zPrepareInput = z.union([
  z.object({
    mode: z.literal('CREATE'),
    dailySemaId: z.string().min(1),
    semaId: z.string().min(1),
    semaVersion: z.string().min(1),
    questionId: z.string().min(1),
    questionVersion: z.string().min(1),
  }),
  z.object({ mode: z.literal('UPDATE'), answerId: z.string().min(1), expectedRevision: z.string().min(1) }),
  z.object({ mode: z.literal('DELETE'), answerId: z.string().min(1), expectedRevision: z.string().min(1) }),
]);

const zTracker = z.object({
  recordType: z.literal('command'),
  kind: z.enum(['ANSWER_WRITE', 'ANSWER_DELETE']),
  operationId: z.string().min(1),
  prepareInput: zPrepareInput,
  executeIntent: z.boolean(),
  networkAllowed: z.boolean().default(true),
  ticketId: z.string().min(1).nullable(),
  outcome: z
    .union([
      z.object({ state: z.literal('SUCCEEDED'), answerId: z.string(), revision: z.string() }),
      z.object({
        state: z.literal('SUCCEEDED'),
        answerId: z.string(),
        effect: z.enum(['DELETED', 'ALREADY_ABSENT']),
      }),
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

export type AnswerPrepareInput = z.output<typeof zPrepareInput>;

export type CommandNamespace = 'create' | 'answer';

const NAMES: Record<CommandNamespace, { tracker: string; payload: string }> = {
  create: { tracker: 'cmd:write:create:', payload: 'cmd-payload:write:create:' },
  answer: { tracker: 'cmd:answer:', payload: 'cmd-payload:answer:' },
};

export class AnswerWriteStore {
  private readonly journal: JournalPort;
  private readonly area: () => ManifestScope | null;
  private readonly names: { tracker: string; payload: string };

  constructor(deps: { journal: JournalPort; area: () => ManifestScope | null; namespace?: CommandNamespace }) {
    this.journal = deps.journal;
    this.area = deps.area;
    this.names = NAMES[deps.namespace ?? 'create'];
  }

  private requireArea(): ManifestScope {
    const area = this.area();
    if (!area) throw new LocalPersistenceFailure('unreadable');
    return area;
  }

  async getTracker(target: string): Promise<AnswerWriteTracker | null> {
    const raw = await this.journal.getRecord(this.requireArea(), this.names.tracker + target);
    if (raw === null) return null;
    const parsed = zTracker.safeParse(raw);
    if (!parsed.success) throw new LocalPersistenceFailure('corrupt');
    return parsed.data;
  }

  putTracker(target: string, tracker: AnswerWriteTracker): Promise<void> {
    return this.journal.putRecord(this.requireArea(), this.names.tracker + target, tracker);
  }

  removeTracker(target: string): Promise<void> {
    return this.journal.removeRecord(this.requireArea(), this.names.tracker + target);
  }

  async getPayload(target: string, operationId: string): Promise<AnswerWritePayload | null> {
    const raw = await this.journal.getRecord(this.requireArea(), this.names.payload + target);
    if (raw === null) return null;
    const parsed = zPayload.safeParse(raw);
    if (!parsed.success) throw new LocalPersistenceFailure('corrupt');
    return parsed.data.operationId === operationId ? parsed.data : null;
  }

  putPayload(target: string, payload: AnswerWritePayload): Promise<void> {
    return this.journal.putRecord(this.requireArea(), this.names.payload + target, payload);
  }

  async listTargets(): Promise<string[]> {
    const manifest = await this.journal.readManifest(this.requireArea());
    const prefix = this.names.tracker;
    return Object.keys(manifest?.entries ?? {})
      .filter((name) => name.startsWith(prefix))
      .map((name) => name.slice(prefix.length));
  }

  removePayload(target: string): Promise<void> {
    return this.journal.removeRecord(this.requireArea(), this.names.payload + target);
  }
}
