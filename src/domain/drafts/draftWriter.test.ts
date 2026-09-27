import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { StorageJournal } from '../../data/storage/journal.ts';
import { createFakeStorage, type FakeStorage } from '../../mocks/platform.ts';
import { type CreateDraftIdentity, DRAFT_TTL_MS, DraftRepository } from './draftRepository.ts';
import { DraftWriter, type KeepStatus, MAX_WAIT_MS, TRAILING_MS } from './draftWriter.ts';

const area = { kind: 'generation', ref: 'area-test' } as const;
const identity: CreateDraftIdentity = {
  kind: 'create',
  dailySemaId: 'synthetic-day',
  semaId: 'synthetic-sema',
  semaVersion: '1',
  questionId: 'synthetic-q1',
  questionVersion: '1',
};

let now = 1_000_000;
const clock = { now: () => now };

async function setup(storage: FakeStorage = createFakeStorage()) {
  const journal = new StorageJournal(storage, clock);
  await journal.initArea(area);
  const repository = new DraftRepository({ journal, clock, area: () => area });
  const statuses: KeepStatus[] = [];
  const writer = new DraftWriter({
    repository,
    identity,
    initialText: '',
    initialLastModifiedAt: null,
    onStatus: (s) => statuses.push(s),
  });
  const draftWrites = () => [...storage.data.keys()].filter((k) => k.includes(':r:')).length;
  return { storage, journal, repository, writer, statuses, draftWrites };
}

beforeEach(() => {
  vi.useFakeTimers();
  now = 1_000_000;
});
afterEach(() => vi.useRealTimers());

describe('MS-CORE-003 keeping schedule', () => {
  test('trailing 500ms: nothing at 499ms, the latest version at 500ms', async () => {
    const { writer, repository } = await setup();
    writer.change('합성', false);
    await vi.advanceTimersByTimeAsync(TRAILING_MS - 1);
    expect(await repository.load(identity)).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(writer.status.kind).toBe('persisted'));
    expect((await repository.load(identity))?.text).toBe('합성');
  });

  test('continuous typing still writes at maxWait 2s from the first unkept change', async () => {
    const { writer, repository } = await setup();
    for (let t = 0; t < MAX_WAIT_MS; t += 400) {
      writer.change(`입력 ${t}`, false);
      await vi.advanceTimersByTimeAsync(400);
    }
    await vi.waitFor(() => expect(writer.status.kind).not.toBe('editing'));
    expect((await repository.load(identity))?.text).toMatch(/^입력 /);
  });

  test('composition in progress commits nothing; compositionend writes the whole string at once', async () => {
    const { writer, repository } = await setup();
    writer.change('ㅎ', true);
    writer.change('하', true);
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS + 100);
    expect(await repository.load(identity)).toBeNull();
    writer.compositionEnd('한');
    await vi.waitFor(() => expect(writer.status.kind).toBe('persisted'));
    expect((await repository.load(identity))?.text).toBe('한');
  });

  test('slow write + newer edit: old success never shows the newer version as kept', async () => {
    const { writer, storage, repository } = await setup();
    const release = storage.holdWrites();
    writer.change('v1', false);
    await vi.advanceTimersByTimeAsync(TRAILING_MS);
    expect(writer.status.kind).toBe('persisting');
    writer.change('v2', false);
    release();
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(writer.status.kind).not.toBe('persisting'));
    expect(writer.status).not.toEqual({ kind: 'persisted', editVersion: 2 });
    expect(writer.isKept).toBe(false);

    await expect(writer.flush()).resolves.toBe(true);
    expect((await repository.load(identity))?.text).toBe('v2');
    expect(writer.status).toEqual({ kind: 'persisted', editVersion: 2 });
  });

  test('write failure reports failed, keeps text, and flush retries', async () => {
    const { writer, storage } = await setup();
    storage.failNextWrite((key) => key.includes(':manifest:'));
    writer.change('보관 실패 합성', false);
    await vi.advanceTimersByTimeAsync(TRAILING_MS);
    await vi.waitFor(() => expect(writer.status.kind).toBe('failed'));
    expect(writer.currentText).toBe('보관 실패 합성');
    await expect(writer.flush()).resolves.toBe(true);
  });

  test('text is kept verbatim: whitespace, blank lines, CRLF-free input and emoji', async () => {
    const { writer, repository } = await setup();
    const text = '  앞뒤 공백  \n\n\n연속   공백 👨‍👩‍👧‍👦 é  ';
    writer.change(text, false);
    await expect(writer.flush()).resolves.toBe(true);
    expect((await repository.load(identity))?.text).toBe(text);
  });
});

describe('draft lifetime (06 §7.4)', () => {
  test('expires exactly 7 days after the last user edit; opening does not extend it', async () => {
    const { writer, repository } = await setup();
    writer.change('만료 합성', false);
    await writer.flush();
    now += DRAFT_TTL_MS - 1;
    expect((await repository.load(identity))?.text).toBe('만료 합성');
    now += 1;
    expect(await repository.load(identity)).toBeNull();
  });

  test('a backwards device clock never expires a draft early', async () => {
    const { writer, repository } = await setup();
    writer.change('시계 합성', false);
    await writer.flush();
    now += DRAFT_TTL_MS - 10;
    await repository.load(identity);
    now -= 5 * DRAFT_TTL_MS;
    expect((await repository.load(identity))?.text).toBe('시계 합성');
  });

  test('a corrupt draft record is an error, not an empty draft', async () => {
    const { writer, storage, repository } = await setup();
    writer.change('손상 합성', false);
    await writer.flush();
    const recordKey = [...storage.data.keys()].find((k) => k.includes(':r:')) ?? '';
    const raw = JSON.parse(storage.data.get(recordKey) ?? '{}') as { data: { text: unknown } };
    raw.data.text = 42;
    storage.data.set(recordKey, JSON.stringify(raw));
    await expect(repository.load(identity)).rejects.toMatchObject({ reason: 'corrupt' });
  });

  test('clearing the text removes the draft', async () => {
    const { writer, repository } = await setup();
    writer.change('지울 합성', false);
    await writer.flush();
    writer.change('', false);
    await writer.flush();
    expect(await repository.load(identity)).toBeNull();
  });
});
