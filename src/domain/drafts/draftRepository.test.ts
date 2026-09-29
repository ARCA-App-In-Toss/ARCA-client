import { describe, expect, test } from 'vitest';
import { StorageJournal } from '../../data/storage/journal.ts';
import { createFakeStorage } from '../../mocks/platform.ts';
import { type CreateDraftIdentity, DRAFT_TTL_MS, DraftRepository } from './draftRepository.ts';

const area = { kind: 'generation', ref: 'area-past' } as const;
const identityFor = (dailySemaId: string, questionId = 'synthetic-q1'): CreateDraftIdentity => ({
  kind: 'create',
  dailySemaId,
  semaId: `sema-${dailySemaId}`,
  semaVersion: '1',
  questionId,
  questionVersion: '1',
});

async function setup() {
  let now = 10 * DRAFT_TTL_MS;
  const clock = { now: () => now };
  const storage = createFakeStorage();
  const journal = new StorageJournal(storage, clock);
  await journal.initArea(area);
  const repository = new DraftRepository({ journal, clock, area: () => area });
  return { storage, repository, advance: (ms: number) => (now += ms), at: () => now };
}

describe('past drafts (06 §7.4, F10 Sheet)', () => {
  test('lists other days only, newest edit first, with the kept date and question; text stays out of the key', async () => {
    const { storage, repository, at } = await setup();
    await repository.save(identityFor('day-1'), '첫째 날 합성', at() - 2_000, {
      dateKst: '2026-09-25',
      questionText: '질문 1',
    });
    await repository.save(identityFor('day-2'), '둘째 날 합성', at() - 1_000, {
      dateKst: '2026-09-26',
      questionText: '질문 2',
    });
    await repository.save(identityFor('today'), '오늘 합성', at(), { dateKst: '2026-09-27', questionText: '질문 3' });

    const rows = await repository.listPast('today');
    expect(rows.map((r) => r.context?.dateKst)).toEqual(['2026-09-26', '2026-09-25']);
    expect(rows[0]).not.toHaveProperty('text');
    expect([...storage.data.keys()].some((k) => k.includes('질문') || k.includes('합성'))).toBe(false);
  });

  test('an expired draft is removed on read; the clock going back never expires early', async () => {
    const { storage, repository, advance, at } = await setup();
    await repository.save(identityFor('day-1'), '만료 합성', at(), { dateKst: '2026-09-20', questionText: '질문' });
    advance(DRAFT_TTL_MS - 1);
    expect(await repository.listPast('today')).toHaveLength(1);
    advance(-DRAFT_TTL_MS);
    expect(await repository.listPast('today')).toHaveLength(1);
    advance(DRAFT_TTL_MS + 1);
    await repository.purgeExpired();
    expect(await repository.load(identityFor('day-1'))).toBeNull();
    expect([...storage.data.values()].some((v) => v.includes('"recordType":"draft"'))).toBe(false);
  });

  test('records kept before the context existed load with a null context', async () => {
    const { repository, at } = await setup();
    await repository.save(identityFor('day-1'), '이전 형식 합성', at());
    expect((await repository.load(identityFor('day-1')))?.context).toBeNull();
  });
});
