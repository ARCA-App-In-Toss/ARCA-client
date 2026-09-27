import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createArcaApi } from '../../data/api/arcaApi.ts';
import type { PrepareAnswerCreate } from '../../data/api/models.ts';
import { createHttpTransport } from '../../data/api/transport.ts';
import { StorageJournal } from '../../data/storage/journal.ts';
import { createHandlers } from '../../mocks/handlers.ts';
import { createFakePlatform, createFakeStorage } from '../../mocks/platform.ts';
import { createMockWorld, MOCK_API_BASE, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { DraftRepository } from '../drafts/draftRepository.ts';
import { SessionController } from '../session/sessionController.ts';
import { AnswerWriteCoordinator, type AnswerWriteCoordinator as Coordinator } from './answerWriteCoordinator.ts';
import { AnswerWriteStore } from './answerWriteStore.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  fenceOverride.value = undefined;
  vi.useRealTimers();
});
afterAll(() => server.close());

const area = { kind: 'generation', ref: 'area-cmd' } as const;
/** Test hook: override the fence (undefined = use the setup's owner). */
const fenceOverride: { value?: { ownerScope: string; generation: string | null } | null | undefined } = {};

async function setup() {
  const world = createMockWorld('server.activeUnanswered');
  server.use(...createHandlers(world));
  const storage = createFakeStorage();
  const platform = createFakePlatform({ storage });
  const api = createArcaApi(createHttpTransport({ baseUrl: MOCK_API_BASE }));
  const session = new SessionController({ api, identity: platform.identity, clock: platform.clock });
  await session.establish();
  const journal = new StorageJournal(storage, platform.clock);
  await journal.initArea(area);
  const store = new AnswerWriteStore({ journal, area: () => area });
  const drafts = new DraftRepository({ journal, clock: platform.clock, area: () => area });
  const synced: string[] = [];
  let fence: { ownerScope: string; generation: string | null } | null = {
    ownerScope: 'owner-a',
    generation: 'gen-synthetic-1',
  };
  let opSeq = 0;
  const coordinator = new AnswerWriteCoordinator({
    session,
    api,
    store,
    drafts,
    now: () => Date.now(),
    fence: () => (fenceOverride.value === undefined ? fence : fenceOverride.value),
    newOperationId: () => `66d9e9af-2026-4000-8000-00000000000${++opSeq}`,
    syncAfterSuccess: async (answerId) => {
      synced.push(answerId);
    },
  });
  const input: PrepareAnswerCreate = {
    mode: 'CREATE',
    dailySemaId: world.sema.dailySemaId,
    semaId: world.sema.semaId,
    semaVersion: world.sema.version,
    questionId: world.sema.primaryQuestion.questionId,
    questionVersion: world.sema.primaryQuestion.version,
  };
  const draftIdentity = {
    kind: 'create' as const,
    dailySemaId: input.dailySemaId,
    semaId: input.semaId,
    semaVersion: input.semaVersion,
    questionId: input.questionId,
    questionVersion: input.questionVersion,
  };
  const save = (content: string, flushOk = true) =>
    coordinator.save({
      input,
      flushDraft: async () => (flushOk ? { text: content, lastModifiedAt: Date.now() } : null),
    });
  const changeOwner = () => {
    fence = { ownerScope: 'owner-b', generation: 'gen-synthetic-2' };
  };
  const ops = (op: string) => world.requests.filter((r) => r.op === op).length;
  return { world, storage, store, drafts, draftIdentity, coordinator, synced, save, ops, input, changeOwner, api };
}

const view = (c: Coordinator, id = 'synthetic-day') => c.getView(id);

describe('MS-CORE-001 normal save', () => {
  test('keep → prepare → execute SUCCEEDED → drafts removed, caches synced, acked, tracker gone', async () => {
    const { world, storage, drafts, draftIdentity, coordinator, synced, save, ops } = await setup();
    await drafts.save(draftIdentity, '합성 답변', Date.now());
    const content = '  합성 답변\n\n원문 그대로 👩‍👩‍👧  ';
    await save(content);

    const v = view(coordinator);
    expect(v.kind).toBe('succeeded');
    const [answer] = world.answersOf(SYNTHETIC_KEYS.registered);
    expect(answer?.content).toBe(content);
    expect(v.kind === 'succeeded' && v.completion.answerId).toBe(answer?.answerId);
    expect(synced).toEqual([answer?.answerId]);
    expect(ops('OP-006')).toBe(1);
    expect(ops('OP-007')).toBe(1);
    expect(ops('OP-009')).toBe(1);
    expect(await drafts.load(draftIdentity)).toBeNull();
    expect([...storage.data.values()].some((raw) => raw.includes('"recordType":"command'))).toBe(false);
  });
});

describe('MS-CORE-004 pre-keeping failure sends nothing', () => {
  test('draft flush not confirmed → no OP-006', async () => {
    const { coordinator, save, ops } = await setup();
    await save('합성', false);
    expect(view(coordinator).kind).toBe('localFailure');
    expect(ops('OP-006')).toBe(0);
  });

  test('payload read-back failure → no OP-006, partial tracker removed', async () => {
    const { coordinator, storage, store, save, ops } = await setup();
    let manifestWrites = 0;
    // tracker: pending+ready manifests (2), payload: pending manifest (3rd) fails.
    storage.failNextWrite((key) => key.includes(':manifest:') && ++manifestWrites === 3);
    await save('합성');
    expect(view(coordinator).kind).toBe('localFailure');
    expect(ops('OP-006')).toBe(0);
    expect(await store.getTracker('synthetic-day')).toBeNull();
  });
});

describe('MS-CORE-005 prepare response lost', () => {
  test('unconfirmed first; recheck restores the same ticket with the same operation id, one answer', async () => {
    const { world, coordinator, store, save, ops } = await setup();
    world.addFault('OP-006', { kind: 'lose-response' });
    await save('합성 준비 유실');
    expect(view(coordinator)).toEqual({ kind: 'unconfirmed', trackerKept: true });
    expect(world.tickets.size).toBe(1);
    const tracker = await store.getTracker('synthetic-day');
    expect(tracker?.ticketId).toBeNull();

    await coordinator.recheck('synthetic-day');
    expect(view(coordinator).kind).toBe('succeeded');
    expect(world.tickets.size).toBe(1);
    expect(ops('OP-006')).toBe(2);
    expect(world.answersOf(SYNTHETIC_KEYS.registered)).toHaveLength(1);
  });

  test('a second save while unresolved resumes the same command instead of starting a new one', async () => {
    const { world, coordinator, save } = await setup();
    world.addFault('OP-006', { kind: 'lose-response' });
    await save('합성 A');
    await save('합성 B — ignored');
    expect(world.tickets.size).toBe(1);
    expect(world.answersOf(SYNTHETIC_KEYS.registered)[0]?.content).toBe('합성 A');
    expect(view(coordinator).kind).toBe('succeeded');
  });
});

describe('MS-CORE-006 execute response lost', () => {
  test('lost after commit → OP-008 confirms success; the effect happened once', async () => {
    const { world, coordinator, save, ops } = await setup();
    world.addFault('OP-007', { kind: 'lose-response' });
    await save('합성 실행 유실');
    expect(view(coordinator).kind).toBe('succeeded');
    expect(ops('OP-007')).toBe(1);
    expect(ops('OP-008')).toBeGreaterThanOrEqual(1);
    expect(world.answersOf(SYNTHETIC_KEYS.registered)).toHaveLength(1);
  });

  test('EXECUTING beyond the 10s cycle becomes static unconfirmed, never failed; recheck later succeeds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { world, coordinator, save, ops } = await setup();
    world.asyncExecution = true;
    const saving = save('합성 비동기');
    await vi.advanceTimersByTimeAsync(10_500);
    await saving;
    expect(view(coordinator)).toEqual({ kind: 'unconfirmed', trackerKept: true });
    expect(ops('OP-008')).toBe(4);
    expect(ops('OP-007')).toBe(1);

    world.completeExecuting();
    await coordinator.recheck('synthetic-day');
    expect(view(coordinator).kind).toBe('succeeded');
    expect(ops('OP-007')).toBe(1);
  });
});

describe('terminal and rejected outcomes', () => {
  test('authenticated prepare rejection: no ticket, draft kept, tracker removed', async () => {
    const { world, coordinator, store, drafts, draftIdentity, save } = await setup();
    world.seedAnswer(SYNTHETIC_KEYS.registered, '이미 있는 합성 답변');
    await drafts.save(draftIdentity, '남길 합성', Date.now());
    await save('남길 합성');
    expect(view(coordinator)).toEqual({ kind: 'rejected', code: 'ANSWER_ALREADY_EXISTS' });
    expect(world.tickets.size).toBe(0);
    expect(await store.getTracker('synthetic-day')).toBeNull();
    expect((await drafts.load(draftIdentity))?.text).toBe('남길 합성');
  });

  test('content over 2,000 EGC reaches NOT_APPLIED terminal and keeps the draft', async () => {
    const { coordinator, drafts, draftIdentity, save } = await setup();
    const over = '가'.repeat(2_001);
    await drafts.save(draftIdentity, over, Date.now());
    await save(over);
    expect(view(coordinator)).toEqual({ kind: 'notApplied', code: 'ANSWER_CONTENT_INVALID' });
    expect((await drafts.load(draftIdentity))?.text).toBe(over);
  });
});

describe('MS-CORE-002 corpus round-trip without trim, normalization or truncation', () => {
  const corpus: [string, string][] = [
    ['whitespace only', '     '],
    ['leading/trailing and runs of spaces', '  앞   뒤  '],
    ['blank lines', '첫 줄\n\n\n넷째 줄'],
    ['CRLF input', '윈도우\r\n줄바꿈'],
    ['ZWJ family and skin tone', '👨‍👩‍👧‍👦 👍🏽'],
    ['combining marks (NFD)', 'é 한가'],
    ['exactly 2,000 EGC with emoji', `${'가'.repeat(1_999)}👩‍💻`],
  ];

  test.each(corpus)('%s', async (_label, content) => {
    const { world, coordinator, save } = await setup();
    await save(content);
    expect(view(coordinator).kind).toBe('succeeded');
    const [stored] = world.answersOf(SYNTHETIC_KEYS.registered);
    expect(stored?.content).toBe(content);

    const api = createArcaApi(createHttpTransport({ baseUrl: MOCK_API_BASE }));
    const token = world.issueToken(SYNTHETIC_KEYS.registered);
    const detail = await api.getAnswer({ bearer: token }, stored?.answerId ?? '');
    expect(detail.content).toBe(content);
  });
});

describe('finishing stages are ordered, confirmed and resumable (06 §8.7)', () => {
  test('termination after the proof: re-entry finishes quietly (drafts, payload, ack once, tracker)', async () => {
    const { world, storage, store, drafts, draftIdentity, coordinator, ops, input } = await setup();
    await drafts.save(draftIdentity, '끝맺음 중 종료 합성', Date.now());
    const answer = world.seedAnswer(SYNTHETIC_KEYS.registered, '끝맺음 중 종료 합성');
    world.tickets.set('synthetic-ticket-9', {
      owner: SYNTHETIC_KEYS.registered,
      ticketId: 'synthetic-ticket-9',
      operationId: '66d9e9af-2026-4000-8000-000000000009',
      fingerprint: JSON.stringify(input),
      dailySemaId: input.dailySemaId,
      question: world.sema.primaryQuestion,
      state: 'SUCCEEDED',
      contentDigest: 'd:x',
      pendingContent: null,
      answerId: answer.answerId,
      error: null,
      completedAt: '2026-09-27T02:00:00Z',
      acknowledged: false,
    });
    // Device state as if the app died right after keeping the proof.
    await store.putTracker(input.dailySemaId, {
      recordType: 'command',
      kind: 'ANSWER_WRITE',
      operationId: '66d9e9af-2026-4000-8000-000000000009',
      prepareInput: input,
      executeIntent: true,
      ticketId: 'synthetic-ticket-9',
      outcome: { state: 'SUCCEEDED', answerId: answer.answerId, revision: 'a-r1' },
      createdAt: Date.now(),
    });
    await store.putPayload(input.dailySemaId, {
      recordType: 'command-payload',
      operationId: '66d9e9af-2026-4000-8000-000000000009',
      content: '끝맺음 중 종료 합성',
      lastModifiedAt: Date.now(),
    });

    expect(await coordinator.unfinished(input.dailySemaId)).toEqual({ kind: 'finishing' });
    await coordinator.recheck(input.dailySemaId, { quiet: true });

    expect(view(coordinator).kind).toBe('idle');
    expect(ops('OP-009')).toBe(1);
    expect(ops('OP-006') + ops('OP-007')).toBe(0);
    expect(await drafts.load(draftIdentity)).toBeNull();
    expect(await store.getTracker(input.dailySemaId)).toBeNull();
    expect([...storage.data.values()].some((raw) => raw.includes('끝맺음 중 종료 합성'))).toBe(false);
  });

  test('a failed payload delete keeps the tracker (no ack); the next entry completes the cleanup', async () => {
    const { store, coordinator, save, ops, input } = await setup();
    const spy = vi.spyOn(store, 'removePayload').mockRejectedValueOnce(new Error('synthetic delete failure'));
    await save('지우기 실패 합성');
    expect(view(coordinator).kind).toBe('succeeded');
    expect(ops('OP-009')).toBe(0);
    expect((await store.getTracker(input.dailySemaId))?.outcome?.state).toBe('SUCCEEDED');

    spy.mockRestore();
    await coordinator.recheck(input.dailySemaId, { quiet: true });
    expect(ops('OP-009')).toBe(1);
    expect(await store.getTracker(input.dailySemaId)).toBeNull();
    expect(await store.getPayload(input.dailySemaId, 'any')).toBeNull();
  });

  test('no durable proof → result shown but no cleanup and no ack; a later drive finishes', async () => {
    const { store, coordinator, save, ops, input } = await setup();
    const put = store.putTracker.bind(store);
    let calls = 0;
    const spy = vi.spyOn(store, 'putTracker').mockImplementation(async (target, tracker) => {
      calls += 1;
      if (tracker.outcome) throw new Error('synthetic proof write failure');
      return put(target, tracker);
    });
    await save('증빙 실패 합성');
    expect(view(coordinator).kind).toBe('succeeded');
    expect(ops('OP-009')).toBe(0);
    expect(calls).toBeGreaterThan(0);

    spy.mockRestore();
    await coordinator.recheck(input.dailySemaId, { quiet: true });
    expect(ops('OP-009')).toBe(1);
    expect(await store.getTracker(input.dailySemaId)).toBeNull();
  });
});

describe('owner fence (06 §4.2)', () => {
  test('owner change mid-run: the run stops; no OP-007, no view for the new owner', async () => {
    const { world, coordinator, save, ops, changeOwner } = await setup();
    let release!: () => void;
    world.addFault('OP-006', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    const saving = save('주인 바뀜 합성');
    await vi.waitFor(() => expect(ops('OP-006')).toBe(1));
    changeOwner();
    coordinator.reset();
    release();
    await saving;
    expect(view(coordinator).kind).toBe('idle');
    expect(ops('OP-007')).toBe(0);
  });

  test('an unreadable tracker reports a local failure (no silent rejection, nothing sent)', async () => {
    const { store, coordinator, save, ops } = await setup();
    vi.spyOn(store, 'getTracker').mockRejectedValueOnce(new Error('synthetic corrupt tracker'));
    await expect(save('읽기 실패 합성')).resolves.toBeUndefined();
    expect(view(coordinator).kind).toBe('localFailure');
    expect(ops('OP-006')).toBe(0);
  });
});

describe('abandoned run never leaves a lock behind', () => {
  test('fence lost mid-keeping (same owner, no reset): view returns to idle, nothing sent', async () => {
    const { coordinator, input, ops } = await setup();
    let releaseFlush!: (kept: { text: string; lastModifiedAt: number }) => void;
    const saving = coordinator.save({
      input,
      flushDraft: () => new Promise((resolve) => (releaseFlush = resolve)),
    });
    expect(view(coordinator).kind).toBe('working');
    await vi.waitFor(() => expect(typeof releaseFlush).toBe('function'));
    // A same-owner reconcile clears the confirmed area, so the fence reads null for a moment.
    fenceOverride.value = null;
    releaseFlush({ text: '재확인 중 합성', lastModifiedAt: Date.now() });
    await saving;
    expect(view(coordinator).kind).toBe('idle');
    expect(ops('OP-006')).toBe(0);
  });

  test('fence lost while the tracker read fails (no reset): idle, not locked, nothing sent', async () => {
    const { store, coordinator, save, ops } = await setup();
    vi.spyOn(store, 'getTracker').mockImplementationOnce(async () => {
      fenceOverride.value = null;
      throw new Error('synthetic tracker read failure');
    });
    await save('읽기 실패 중 영역 변경 합성');
    expect(view(coordinator).kind).toBe('idle');
    expect(ops('OP-006')).toBe(0);
  });

  test('fence lost during the last result check that fails (no reset): idle, tracker kept for recheck', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { world, api, store, coordinator, save, input } = await setup();
    world.asyncExecution = true;
    const original = api.getAnswerWriteResult.bind(api);
    let calls = 0;
    vi.spyOn(api, 'getAnswerWriteResult').mockImplementation(async (...args) => {
      calls += 1;
      if (calls < 4) return original(...args);
      fenceOverride.value = null;
      throw new Error('synthetic transport failure');
    });
    const saving = save('확인 중 영역 변경 합성');
    await vi.advanceTimersByTimeAsync(10_500);
    await saving;
    expect(calls).toBe(4);
    expect(view(coordinator).kind).toBe('idle');
    // Unknown outcome: never treated as not applied; the kept tracker is resumed on re-entry.
    expect(await store.getTracker(input.dailySemaId)).not.toBeNull();
  });
});
