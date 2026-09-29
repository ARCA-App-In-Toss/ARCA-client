import { z } from 'zod';
import { LocalPersistenceFailure } from '../failures.ts';
import type { ClockPort } from '../ports/platform.ts';
import type { JournalPort, ManifestScope } from '../ports/storage.ts';

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export interface CreateDraftIdentity {
  kind: 'create';
  dailySemaId: string;
  semaId: string;
  semaVersion: string;
  questionId: string;
  questionVersion: string;
}

export interface UpdateDraftIdentity {
  kind: 'update';
  answerId: string;
  baseRevision: string;
}

export type DraftIdentity = CreateDraftIdentity | UpdateDraftIdentity;

export interface DraftContext {
  dateKst: string;
  questionText: string;
}

export interface Draft {
  identity: DraftIdentity;
  text: string;
  context: DraftContext | null;
  lastModifiedAt: number;
  expiresAt: number;
}

const zCreateIdentity = z.object({
  kind: z.literal('create'),
  dailySemaId: z.string().min(1),
  semaId: z.string().min(1),
  semaVersion: z.string().min(1),
  questionId: z.string().min(1),
  questionVersion: z.string().min(1),
});

const zUpdateIdentity = z.object({
  kind: z.literal('update'),
  answerId: z.string().min(1),
  baseRevision: z.string().min(1),
});

const zDraftRecord = z.object({
  recordType: z.literal('draft'),
  identity: z.union([zCreateIdentity, zUpdateIdentity]),
  text: z.string(),
  lastModifiedAt: z.number(),
  context: z.object({ dateKst: z.string().min(1), questionText: z.string() }).optional(),
});

export interface PastDraftSummary {
  identity: CreateDraftIdentity;
  context: DraftContext | null;
  lastModifiedAt: number;
  expiresAt: number;
}

const DRAFT_PREFIX = 'draft:create:';
const UPDATE_PREFIX = 'draft:update:';

export function draftName(identity: DraftIdentity): string {
  if (identity.kind === 'update') return `${UPDATE_PREFIX}${identity.answerId}@${identity.baseRevision}`;
  return `${DRAFT_PREFIX}${identity.dailySemaId}:${identity.semaId}@${identity.semaVersion}:${identity.questionId}@${identity.questionVersion}`;
}

function sameIdentity(a: DraftIdentity, b: DraftIdentity): boolean {
  return draftName(a) === draftName(b);
}

export class DraftRepository {
  private readonly journal: JournalPort;
  private readonly clock: ClockPort;
  private readonly area: () => ManifestScope | null;
  private lastObservedAt = 0;

  constructor(deps: { journal: JournalPort; clock: ClockPort; area: () => ManifestScope | null }) {
    this.journal = deps.journal;
    this.clock = deps.clock;
    this.area = deps.area;
  }

  now(): number {
    this.lastObservedAt = Math.max(this.lastObservedAt, this.clock.now());
    return this.lastObservedAt;
  }

  private requireArea(): ManifestScope {
    const area = this.area();
    if (!area) throw new LocalPersistenceFailure('unreadable');
    return area;
  }

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
    return { identity, text: parsed.data.text, context: parsed.data.context ?? null, lastModifiedAt, expiresAt };
  }

  async listPast(currentDailySemaId: string | null): Promise<PastDraftSummary[]> {
    const area = this.requireArea();
    const manifest = await this.journal.readManifest(area);
    const found: PastDraftSummary[] = [];
    for (const name of Object.keys(manifest?.entries ?? {})) {
      if (!name.startsWith(DRAFT_PREFIX)) continue;
      const parsed = zDraftRecord.safeParse(await this.journal.getRecord(area, name).catch(() => null));
      if (!parsed.success || draftName(parsed.data.identity) !== name) continue;
      const identity = parsed.data.identity;
      if (identity.kind !== 'create' || identity.dailySemaId === currentDailySemaId) continue;
      const draft = await this.load(identity).catch(() => null);
      if (!draft || draft.text === '') continue;
      found.push({
        identity,
        context: draft.context,
        lastModifiedAt: draft.lastModifiedAt,
        expiresAt: draft.expiresAt,
      });
    }
    return found.sort((a, b) => b.lastModifiedAt - a.lastModifiedAt);
  }

  async purgeExpired(): Promise<void> {
    await this.listPast(null);
    await this.listUpdateDrafts(null);
  }

  async listUpdateDrafts(answerId: string | null): Promise<Draft[]> {
    const area = this.requireArea();
    const manifest = await this.journal.readManifest(area);
    const prefix = answerId === null ? UPDATE_PREFIX : `${UPDATE_PREFIX}${answerId}@`;
    const found: Draft[] = [];
    for (const name of Object.keys(manifest?.entries ?? {})) {
      if (!name.startsWith(prefix)) continue;
      const parsed = zDraftRecord.safeParse(await this.journal.getRecord(area, name).catch(() => null));
      if (!parsed.success || draftName(parsed.data.identity) !== name) continue;
      const draft = await this.load(parsed.data.identity).catch(() => null);
      if (draft) found.push(draft);
    }
    return found.sort((a, b) => b.lastModifiedAt - a.lastModifiedAt);
  }

  async removeAllForAnswer(answerId: string): Promise<void> {
    const area = this.requireArea();
    const manifest = await this.journal.readManifest(area);
    const prefix = `${UPDATE_PREFIX}${answerId}@`;
    for (const name of Object.keys(manifest?.entries ?? {})) {
      if (name.startsWith(prefix)) await this.journal.removeRecord(area, name);
    }
  }

  async save(identity: DraftIdentity, text: string, lastModifiedAt: number, context?: DraftContext): Promise<void> {
    const area = this.requireArea();
    await this.journal.putRecord(area, draftName(identity), {
      recordType: 'draft',
      identity:
        identity.kind === 'update'
          ? { kind: 'update', answerId: identity.answerId, baseRevision: identity.baseRevision }
          : {
              kind: 'create',
              dailySemaId: identity.dailySemaId,
              semaId: identity.semaId,
              semaVersion: identity.semaVersion,
              questionId: identity.questionId,
              questionVersion: identity.questionVersion,
            },
      text,
      lastModifiedAt,
      ...(context ? { context: { dateKst: context.dateKst, questionText: context.questionText } } : {}),
    } satisfies z.input<typeof zDraftRecord>);
  }

  async remove(identity: DraftIdentity): Promise<void> {
    await this.journal.removeRecord(this.requireArea(), draftName(identity));
  }

  async removeAllForDailySema(dailySemaId: string): Promise<void> {
    const area = this.requireArea();
    const manifest = await this.journal.readManifest(area);
    const prefix = `${DRAFT_PREFIX}${dailySemaId}:`;
    for (const name of Object.keys(manifest?.entries ?? {})) {
      if (name.startsWith(prefix)) await this.journal.removeRecord(area, name);
    }
  }
}
