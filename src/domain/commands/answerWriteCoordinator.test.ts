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

async function setup(options: { deletionFenced?: () => boolean } = {}) {
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
    syncCurrentResources: async (event) => {
      synced.push(event.answerId);
    },
    ...(options.deletionFenced ? { deletionFenced: options.deletionFenced } : {}),
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
      networkAllowed: true,
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
    coordinator.acknowledgeView(input.dailySemaId);
    // Re-entry without the proof is a non-quiet check, yet the success already shown is not repeated.
    await coordinator.recheck(input.dailySemaId);
    expect(view(coordinator).kind).toBe('idle');
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

  test('generation change (same owner) + reset: a new save starts fresh instead of joining the abandoned run', async () => {
    const { world, coordinator, save, ops } = await setup();
    let release!: () => void;
    world.addFault('OP-006', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    const first = save('세대 바뀜 합성');
    await vi.waitFor(() => expect(ops('OP-006')).toBe(1));
    fenceOverride.value = { ownerScope: 'owner-a', generation: 'gen-synthetic-2' };
    coordinator.reset();
    const second = save('세대 바뀐 뒤 합성');
    release();
    await Promise.all([first, second]);
    // The second save ran on its own: it sent its own OP-006 and ended in a view of its own.
    expect(ops('OP-006')).toBe(2);
    expect(view(coordinator).kind).not.toBe('idle');
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

describe('IX-041 explicit close of a prepared request (MS-CMD-004)', () => {
  const OPERATION = '66d9e9af-2026-4000-8000-000000000008';

  /** Server holds a ticket; the device kept the tracker but not the payload (lost or expired). */
  async function preparedWithoutPayload(state: 'PREPARED' | 'EXECUTING' | 'SUCCEEDED' = 'PREPARED') {
    const ctx = await setup();
    const { world, store, input } = ctx;
    const answer = state === 'SUCCEEDED' ? world.seedAnswer(SYNTHETIC_KEYS.registered, '다른 경로 성공 합성') : null;
    world.tickets.set('synthetic-ticket-8', {
      owner: SYNTHETIC_KEYS.registered,
      ticketId: 'synthetic-ticket-8',
      operationId: OPERATION,
      fingerprint: JSON.stringify(input),
      dailySemaId: input.dailySemaId,
      question: world.sema.primaryQuestion,
      state,
      contentDigest: state === 'PREPARED' ? null : 'd:x',
      pendingContent: state === 'EXECUTING' ? '실행 중 합성' : null,
      answerId: answer?.answerId ?? null,
      error: null,
      completedAt: answer ? '2026-09-27T02:00:00Z' : null,
      acknowledged: false,
    });
    await store.putTracker(input.dailySemaId, {
      recordType: 'command',
      kind: 'ANSWER_WRITE',
      operationId: OPERATION,
      prepareInput: input,
      executeIntent: true,
      networkAllowed: true,
      ticketId: 'synthetic-ticket-8',
      outcome: null,
      createdAt: Date.now(),
    });
    return ctx;
  }

  test('re-entry with no exact payload: no OP-007, no polling loop, close offered; nothing closed yet', async () => {
    const { coordinator, store, input, ops } = await preparedWithoutPayload();
    await coordinator.recheck(input.dailySemaId);
    expect(view(coordinator)).toEqual({ kind: 'unconfirmed', trackerKept: true, recovery: 'closePrepared' });
    expect(ops('OP-007')).toBe(0);
    expect(ops('OP-008')).toBe(1);
    // OP-015 only ever follows the user's action (05 §6.10).
    expect(ops('OP-015')).toBe(0);
    expect(await store.getTracker(input.dailySemaId)).not.toBeNull();
  });

  test('close → NOT_APPLIED/COMMAND_CLOSED: tracker gone, draft kept, acked; a new save uses a new operation', async () => {
    const { coordinator, store, drafts, draftIdentity, input, world, ops, save } = await preparedWithoutPayload();
    await drafts.save(draftIdentity, '남겨 둘 합성 입력', Date.now());
    await coordinator.recheck(input.dailySemaId);
    await coordinator.close(input.dailySemaId);

    expect(view(coordinator)).toEqual({ kind: 'notApplied', code: 'COMMAND_CLOSED' });
    expect(world.tickets.get('synthetic-ticket-8')?.state).toBe('NOT_APPLIED');
    expect(ops('OP-015')).toBe(1);
    expect(ops('OP-009')).toBe(1);
    expect(await store.getTracker(input.dailySemaId)).toBeNull();
    expect((await drafts.load(draftIdentity))?.text).toBe('남겨 둘 합성 입력');

    coordinator.acknowledgeView(input.dailySemaId);
    await save('새 요청 합성');
    expect(view(coordinator).kind).toBe('succeeded');
    const tickets = [...world.tickets.values()];
    expect(tickets).toHaveLength(2);
    expect(tickets[1]?.operationId).not.toBe(OPERATION);
  });

  test('execute already accepted (EXECUTING): close keeps checking, never force-closes', async () => {
    const { coordinator, store, input, world } = await preparedWithoutPayload('EXECUTING');
    await coordinator.close(input.dailySemaId);
    expect(view(coordinator)).toEqual({ kind: 'unconfirmed', trackerKept: true });
    expect(world.tickets.get('synthetic-ticket-8')?.state).toBe('EXECUTING');
    expect(await store.getTracker(input.dailySemaId)).not.toBeNull();
  });

  test('execute won the race (SUCCEEDED): the close returns the success and it settles normally', async () => {
    const { coordinator, store, input, synced } = await preparedWithoutPayload('SUCCEEDED');
    await coordinator.close(input.dailySemaId);
    expect(view(coordinator).kind).toBe('succeeded');
    expect(synced).toHaveLength(1);
    expect(await store.getTracker(input.dailySemaId)).toBeNull();
  });

  test.each([
    [
      'lost response (the close did apply)',
      { kind: 'lose-response' } as const,
      { kind: 'notApplied', code: 'COMMAND_CLOSED' },
    ],
    [
      '404 COMMAND_NOT_FOUND',
      { kind: 'error', status: 404, body: { code: 'COMMAND_NOT_FOUND', category: 'VALIDATION' } } as const,
      { kind: 'unconfirmed', trackerKept: true, recovery: 'closePrepared' },
    ],
  ])('%s: never read as "not applied" locally; tracker kept until the server says so', async (_, fault, later) => {
    const { coordinator, store, input, world } = await preparedWithoutPayload();
    world.addFault('OP-015', fault);
    await coordinator.close(input.dailySemaId);
    expect(view(coordinator)).toEqual({ kind: 'unconfirmed', trackerKept: true });
    expect(await store.getTracker(input.dailySemaId)).not.toBeNull();
    // The next explicit check reads the server state: closed, or still prepared and closable.
    await coordinator.recheck(input.dailySemaId);
    expect(view(coordinator)).toEqual(later);
  });
});

describe('tracker kept before its payload (06 §8.3 #4)', () => {
  async function neverSentTracker() {
    const ctx = await setup();
    await ctx.store.putTracker(ctx.input.dailySemaId, {
      recordType: 'command',
      kind: 'ANSWER_WRITE',
      operationId: '66d9e9af-2026-4000-8000-000000000007',
      prepareInput: ctx.input,
      executeIntent: true,
      networkAllowed: false,
      ticketId: null,
      outcome: null,
      createdAt: Date.now(),
    });
    return ctx;
  }

  test('re-entry drops it without any request; the screen is not locked', async () => {
    const { coordinator, store, input, ops } = await neverSentTracker();
    await coordinator.recheck(input.dailySemaId);
    expect(view(coordinator).kind).toBe('idle');
    expect(ops('OP-006')).toBe(0);
    expect(await store.getTracker(input.dailySemaId)).toBeNull();
  });

  test('a user save replaces it with a new operation', async () => {
    const { coordinator, world, save } = await neverSentTracker();
    await save('새로 저장 합성');
    expect(view(coordinator).kind).toBe('succeeded');
    expect([...world.tickets.values()][0]?.operationId).not.toBe('66d9e9af-2026-4000-8000-000000000007');
  });

  test('payload write fails: the tracker is not network-allowed and nothing is sent', async () => {
    const { coordinator, store, input, ops, save } = await setup();
    vi.spyOn(store, 'putPayload').mockRejectedValueOnce(new Error('synthetic payload failure'));
    await save('선보관 실패 합성');
    expect(view(coordinator).kind).toBe('localFailure');
    expect(ops('OP-006')).toBe(0);
    const left = await store.getTracker(input.dailySemaId);
    expect(left === null || left.networkAllowed === false).toBe(true);
  });

  test('owner changes while dropping: the records are left for the next owner check', async () => {
    const { coordinator, store, input, ops } = await neverSentTracker();
    vi.spyOn(store, 'removePayload').mockImplementationOnce(async () => {
      fenceOverride.value = null;
    });
    await coordinator.recheck(input.dailySemaId);
    expect(ops('OP-006')).toBe(0);
    expect(await store.getTracker(input.dailySemaId)).not.toBeNull();
  });
});

describe('IX-041 past result no longer retained (CLOSED_OUTCOME_UNAVAILABLE)', () => {
  const OPERATION = '66d9e9af-2026-4000-8000-000000000006';

  async function expiredTicket(options: { answered: boolean }) {
    const ctx = await setup();
    const { world, store, input } = ctx;
    const answer = options.answered ? world.seedAnswer(SYNTHETIC_KEYS.registered, '다른 경로 기록 합성') : null;
    world.tickets.set('synthetic-ticket-6', {
      owner: SYNTHETIC_KEYS.registered,
      ticketId: 'synthetic-ticket-6',
      operationId: OPERATION,
      fingerprint: JSON.stringify(input),
      dailySemaId: input.dailySemaId,
      question: world.sema.primaryQuestion,
      state: 'EXECUTING',
      contentDigest: 'd:x',
      pendingContent: null,
      answerId: null,
      error: null,
      completedAt: null,
      acknowledged: false,
      resultExpired: true,
    });
    await store.putTracker(input.dailySemaId, {
      recordType: 'command',
      kind: 'ANSWER_WRITE',
      operationId: OPERATION,
      prepareInput: input,
      executeIntent: true,
      networkAllowed: true,
      ticketId: 'synthetic-ticket-6',
      outcome: null,
      createdAt: Date.now(),
    });
    return { ...ctx, answer };
  }

  test('a check claims neither success nor failure and offers the cleanup; no OP-015 yet', async () => {
    const { coordinator, store, input, ops } = await expiredTicket({ answered: false });
    await coordinator.recheck(input.dailySemaId);
    expect(view(coordinator)).toEqual({ kind: 'unconfirmed', trackerKept: true, recovery: 'cleanUpExpired' });
    expect(ops('OP-008')).toBe(1);
    expect(ops('OP-015')).toBe(0);
    expect(await store.getTracker(input.dailySemaId)).not.toBeNull();
  });

  test('cleanup with a current answer: tracker gone, current answer synced, no ack, no success', async () => {
    const { coordinator, store, input, ops, synced, answer } = await expiredTicket({ answered: true });
    await coordinator.recheck(input.dailySemaId);
    await coordinator.close(input.dailySemaId);
    expect(view(coordinator)).toEqual({
      kind: 'reconciled',
      reconciliation: {
        checkedAt: '2026-09-27T02:00:00Z',
        nextAction: 'REVIEW_CURRENT_ANSWER',
        answerId: answer?.answerId,
        revision: 'a-r1',
      },
    });
    expect(synced).toEqual([answer?.answerId]);
    expect(ops('OP-009')).toBe(0);
    expect(await store.getTracker(input.dailySemaId)).toBeNull();
  });

  test('cleanup with no answer today: create again is allowed, drafts kept', async () => {
    const { coordinator, store, drafts, draftIdentity, input } = await expiredTicket({ answered: false });
    await drafts.save(draftIdentity, '남은 입력 합성', Date.now());
    await coordinator.close(input.dailySemaId);
    const v = view(coordinator);
    expect(v.kind === 'reconciled' && v.reconciliation.nextAction).toBe('CREATE_CURRENT_DAY');
    expect(await store.getTracker(input.dailySemaId)).toBeNull();
    expect((await drafts.load(draftIdentity))?.text).toBe('남은 입력 합성');
  });

  test('cleanup request fails: tracker kept, never read as not applied', async () => {
    const { coordinator, store, input, world } = await expiredTicket({ answered: false });
    world.addFault('OP-015', { kind: 'network' });
    await coordinator.close(input.dailySemaId);
    expect(view(coordinator)).toEqual({ kind: 'unconfirmed', trackerKept: true });
    expect(await store.getTracker(input.dailySemaId)).not.toBeNull();
  });
});

describe('7-day payload expiry (06 §8.6)', () => {
  const OPERATION = '66d9e9af-2026-4000-8000-000000000005';
  const DAY = 24 * 60 * 60 * 1_000;

  async function preparedWithPayload(editedAgo: number, options: Parameters<typeof setup>[0] = {}) {
    const ctx = await setup(options);
    const { world, store, input } = ctx;
    world.tickets.set('synthetic-ticket-5', {
      owner: SYNTHETIC_KEYS.registered,
      ticketId: 'synthetic-ticket-5',
      operationId: OPERATION,
      fingerprint: JSON.stringify(input),
      dailySemaId: input.dailySemaId,
      question: world.sema.primaryQuestion,
      state: 'PREPARED',
      contentDigest: null,
      pendingContent: null,
      answerId: null,
      error: null,
      completedAt: null,
      acknowledged: false,
    });
    await store.putTracker(input.dailySemaId, {
      recordType: 'command',
      kind: 'ANSWER_WRITE',
      operationId: OPERATION,
      prepareInput: input,
      executeIntent: true,
      networkAllowed: true,
      ticketId: 'synthetic-ticket-5',
      outcome: null,
      createdAt: Date.now() - editedAgo,
    });
    await store.putPayload(input.dailySemaId, {
      recordType: 'command-payload',
      operationId: OPERATION,
      content: '오래된 합성 본문',
      lastModifiedAt: Date.now() - editedAgo,
    });
    return ctx;
  }

  test('MS-ALLDEL-005 behind the deletion fence a new save is refused before anything is kept or sent', async () => {
    let fenced = true;
    const { save, coordinator, ops, store, input } = await setup({ deletionFenced: () => fenced });
    await save('펜스 뒤 합성');
    expect(coordinator.getView(input.dailySemaId)).toEqual({ kind: 'rejected', code: 'COMMAND_ALREADY_PENDING' });
    expect(ops('OP-006')).toBe(0);
    await expect(store.getTracker(input.dailySemaId)).resolves.toBeNull();
    fenced = false;
    coordinator.acknowledgeView(input.dailySemaId);
    await save('펜스 뒤 합성');
    expect(ops('OP-006')).toBe(1);
  });

  test('MS-ALLDEL-005 behind the deletion fence a kept PREPARED payload is not executed; recheckAll is skipped', async () => {
    let fenced = true;
    const { coordinator, input, ops } = await preparedWithPayload(DAY, { deletionFenced: () => fenced });
    await coordinator.recheckAll();
    expect(ops('OP-008')).toBe(0);
    await coordinator.recheck(input.dailySemaId);
    expect(ops('OP-007')).toBe(0);
    fenced = false;
    await coordinator.recheck(input.dailySemaId);
    expect(ops('OP-007')).toBe(1);
  }, 20_000);

  test('expired payload: removed, no auto-execution, close offered; the tracker stays', async () => {
    const { coordinator, store, input, ops } = await preparedWithPayload(7 * DAY + 1);
    await coordinator.recheck(input.dailySemaId);
    expect(view(coordinator)).toEqual({ kind: 'unconfirmed', trackerKept: true, recovery: 'closePrepared' });
    expect(ops('OP-007')).toBe(0);
    expect(await store.getPayload(input.dailySemaId, OPERATION)).toBeNull();
    expect(await store.getTracker(input.dailySemaId)).not.toBeNull();
  });

  test('within 7 days the same ticket runs with the exact kept payload', async () => {
    const { coordinator, input, ops, world } = await preparedWithPayload(7 * DAY - 60_000);
    await coordinator.recheck(input.dailySemaId);
    expect(view(coordinator).kind).toBe('succeeded');
    expect(ops('OP-007')).toBe(1);
    expect(world.answersOf(SYNTHETIC_KEYS.registered)[0]?.content).toBe('오래된 합성 본문');
  });

  test('startup sweep removes only expired payloads and sends nothing', async () => {
    const { coordinator, store, input, world } = await preparedWithPayload(8 * DAY);
    const before = world.requests.length;
    await coordinator.expirePayloads();
    expect(await store.getPayload(input.dailySemaId, OPERATION)).toBeNull();
    expect(await store.getTracker(input.dailySemaId)).not.toBeNull();
    expect(world.requests.length).toBe(before);
  });
});

describe('background / foreground (06 §8.5 #6)', () => {
  test('background stops the result-check cycle as unknown; foreground checks once and confirms', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { world, coordinator, save, ops, input } = await setup();
    world.asyncExecution = true;
    const saving = save('백그라운드 합성');
    await vi.advanceTimersByTimeAsync(1_200);
    const checksBefore = ops('OP-008');
    coordinator.suspend();
    await saving;
    expect(view(coordinator)).toEqual({ kind: 'unconfirmed', trackerKept: true });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(ops('OP-008')).toBe(checksBefore);
    expect(ops('OP-007')).toBe(1);

    world.completeExecuting();
    coordinator.resume();
    await coordinator.recheckAll();
    expect(view(coordinator, input.dailySemaId).kind).toBe('succeeded');
    expect(ops('OP-007')).toBe(1);
  });

  test('recheckAll skips the excluded target and runs at most two at a time', async () => {
    const { coordinator, store, input, api } = await setup();
    const tracker = (dailySemaId: string) => ({
      recordType: 'command' as const,
      kind: 'ANSWER_WRITE' as const,
      operationId: `66d9e9af-2026-4000-8000-0000000001${dailySemaId.slice(-2)}`,
      prepareInput: { ...input, dailySemaId },
      executeIntent: true,
      networkAllowed: true,
      ticketId: `synthetic-ticket-x${dailySemaId}`,
      outcome: null,
      createdAt: Date.now(),
    });
    for (const id of ['past-01', 'past-02', 'past-03', 'past-04']) await store.putTracker(id, tracker(id));
    let running = 0;
    let peak = 0;
    const seen: string[] = [];
    vi.spyOn(api, 'getAnswerWriteResult').mockImplementation(async (_auth, ticketId) => {
      running += 1;
      peak = Math.max(peak, running);
      seen.push(ticketId);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return {
        state: 'NOT_APPLIED',
        ticketId,
        operationId: 'x',
        error: { code: 'COMMAND_EXPIRED', category: 'CONFLICT' },
      };
    });
    await coordinator.recheckAll({ except: 'past-04' });
    expect(peak).toBeLessThanOrEqual(2);
    expect(new Set(seen.map((s) => s.slice(-7)))).toEqual(new Set(['past-01', 'past-02', 'past-03']));
  });
});

describe('expiry sweep never removes a newer payload (architecture round 1)', () => {
  test('a save replacing the operation during the sweep keeps its own payload', async () => {
    const { coordinator, store, input, world, save } = await setup();
    const DAY = 24 * 60 * 60 * 1_000;
    await store.putTracker(input.dailySemaId, {
      recordType: 'command',
      kind: 'ANSWER_WRITE',
      operationId: '66d9e9af-2026-4000-8000-000000000004',
      prepareInput: input,
      executeIntent: true,
      networkAllowed: false,
      ticketId: null,
      outcome: null,
      createdAt: Date.now() - 8 * DAY,
    });
    await store.putPayload(input.dailySemaId, {
      recordType: 'command-payload',
      operationId: '66d9e9af-2026-4000-8000-000000000004',
      content: '오래된 합성',
      lastModifiedAt: Date.now() - 8 * DAY,
    });
    const original = store.getPayload.bind(store);
    let saving: Promise<void> | null = null;
    vi.spyOn(store, 'getPayload').mockImplementationOnce(async (...args) => {
      const found = await original(...args);
      saving = save('새 요청 합성'); // the user saves while the sweep is reading
      return found;
    });
    await coordinator.expirePayloads();
    await saving;
    const tracker = await store.getTracker(input.dailySemaId);
    expect(tracker?.operationId).not.toBe('66d9e9af-2026-4000-8000-000000000004');
    expect(world.tickets.size).toBe(1);
    expect(world.requests.filter((r) => r.op === 'OP-007')).toHaveLength(1);
  });
});
