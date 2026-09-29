import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createArcaApi } from '../../data/api/arcaApi.ts';
import { createHttpTransport } from '../../data/api/transport.ts';
import { StorageJournal } from '../../data/storage/journal.ts';
import { createHandlers } from '../../mocks/handlers.ts';
import { createFakePlatform, createFakeStorage } from '../../mocks/platform.ts';
import { createMockWorld, MOCK_API_BASE, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { DraftRepository } from '../drafts/draftRepository.ts';
import { SessionController } from '../session/sessionController.ts';
import { AnswerWriteCoordinator, type SyncEvent } from './answerWriteCoordinator.ts';
import { AnswerWriteStore } from './answerWriteStore.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

const area = { kind: 'generation', ref: 'area-answer' } as const;

async function setup() {
  const world = createMockWorld('server.activeUnanswered');
  server.use(...createHandlers(world));
  const answer = world.seedAnswer(SYNTHETIC_KEYS.registered, '원래 합성 답변');
  const storage = createFakeStorage();
  const platform = createFakePlatform({ storage });
  const api = createArcaApi(createHttpTransport({ baseUrl: MOCK_API_BASE }));
  const session = new SessionController({ api, identity: platform.identity, clock: platform.clock });
  await session.establish();
  const journal = new StorageJournal(storage, platform.clock);
  await journal.initArea(area);
  const store = new AnswerWriteStore({ journal, area: () => area, namespace: 'answer' });
  const createStore = new AnswerWriteStore({ journal, area: () => area });
  const drafts = new DraftRepository({ journal, clock: platform.clock, area: () => area });
  const synced: SyncEvent[] = [];
  let opSeq = 0;
  const coordinator = new AnswerWriteCoordinator({
    session,
    api,
    store,
    drafts,
    now: () => Date.now(),
    fence: () => ({ ownerScope: 'owner-a', generation: 'gen-synthetic-1' }),
    newOperationId: () => `77d9e9af-2026-4000-8000-00000000000${++opSeq}`,
    syncCurrentResources: async (event) => {
      synced.push(event);
    },
  });
  const baseRevision = answer.revision;
  const editIdentity = { kind: 'update' as const, answerId: answer.answerId, baseRevision };
  const saveEdit = (content: string) =>
    coordinator.save({
      input: { mode: 'UPDATE', answerId: answer.answerId, expectedRevision: baseRevision },
      flushDraft: async () => ({ text: content, lastModifiedAt: Date.now() }),
    });
  const remove = () => coordinator.delete({ input: { answerId: answer.answerId, expectedRevision: baseRevision } });
  const ops = (op: string) => world.requests.filter((r) => r.op === op).length;
  return {
    world,
    storage,
    store,
    createStore,
    drafts,
    coordinator,
    synced,
    answer,
    editIdentity,
    saveEdit,
    remove,
    ops,
  };
}

describe('MS-EDIT-001 edit command', () => {
  test('UPDATE success: exact content applied, only its base-revision draft removed, sync carries the payload', async () => {
    const { world, drafts, coordinator, synced, answer, editIdentity, saveEdit, ops } = await setup();
    await drafts.save(editIdentity, '고친 합성', Date.now());
    const other = { ...editIdentity, baseRevision: 'a-r-stale' };
    await drafts.save(other, '낡은 기준 합성', Date.now());
    const content = '  고친 합성\n\n👩‍👩‍👧  ';
    await saveEdit(content);

    expect(coordinator.getView(answer.answerId).kind).toBe('succeeded');
    const stored = world.answers.get(answer.answerId);
    expect(stored?.content).toBe(content);
    expect(stored?.isEdited).toBe(true);
    expect(stored?.question).toEqual(answer.question);
    expect(await drafts.load(editIdentity)).toBeNull();
    expect((await drafts.load(other))?.text).toBe('낡은 기준 합성');
    expect(synced).toEqual([
      expect.objectContaining({ kind: 'updated', baseRevision: 'a-r1', revision: stored?.revision, content }),
    ]);
    expect(ops('OP-009')).toBe(1);
  });

  test('execute response lost: OP-008 confirms the edit; never reported as not applied', async () => {
    const { world, coordinator, answer, saveEdit, ops } = await setup();
    world.addFault('OP-007', { kind: 'lose-response' });
    await saveEdit('유실 뒤 합성');
    expect(coordinator.getView(answer.answerId).kind).toBe('succeeded');
    expect(ops('OP-007')).toBe(1);
    expect(world.answers.get(answer.answerId)?.content).toBe('유실 뒤 합성');
  });

  test('stale base revision at prepare: rejected with no ticket, nothing changed', async () => {
    const { world, coordinator, answer, saveEdit } = await setup();
    const current = world.answers.get(answer.answerId);
    if (current) current.revision = 'a-r-other';
    await saveEdit('늦은 합성');
    expect(coordinator.getView(answer.answerId)).toEqual({ kind: 'rejected', code: 'REVISION_CONFLICT' });
    expect(world.tickets.size).toBe(0);
    expect(world.answers.get(answer.answerId)?.content).toBe('원래 합성 답변');
  });
});

describe('single delete command (06 §9.2)', () => {
  test('success: kept intent → OP-012 → OP-007; drafts of the answer go only after the terminal', async () => {
    const { world, drafts, coordinator, synced, answer, editIdentity, remove, ops } = await setup();
    await drafts.save(editIdentity, '지워질 수정 합성', Date.now());
    await remove();
    expect(coordinator.getView(answer.answerId)).toEqual({ kind: 'deleted' });
    expect(world.answers.has(answer.answerId)).toBe(false);
    expect(ops('OP-012')).toBe(1);
    expect(await drafts.listUpdateDrafts(answer.answerId)).toEqual([]);
    expect(synced).toEqual([{ kind: 'deleted', answerId: answer.answerId }]);
    expect(ops('OP-009')).toBe(1);
  });

  test('prepare response lost: unconfirmed; recheck restores the same operation and deletes once', async () => {
    const { world, coordinator, store, answer, remove, ops } = await setup();
    world.addFault('OP-012', { kind: 'lose-response' });
    await remove();
    expect(coordinator.getView(answer.answerId)).toEqual({ kind: 'unconfirmed', trackerKept: true });
    expect(world.answers.has(answer.answerId)).toBe(true);
    const tracker = await store.getTracker(answer.answerId);
    expect(tracker?.kind).toBe('ANSWER_DELETE');
    expect(tracker?.ticketId).toBeNull();

    await coordinator.recheck(answer.answerId);
    expect(coordinator.getView(answer.answerId)).toEqual({ kind: 'deleted' });
    expect(world.tickets.size).toBe(1);
    expect(ops('OP-012')).toBe(2);
    expect(ops('OP-007')).toBe(1);
  });

  test('unknown execute outcome past the cycle stays unconfirmed; the detail is never judged absent', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { world, coordinator, store, answer, remove, drafts, editIdentity } = await setup();
    await drafts.save(editIdentity, '남을 수정 합성', Date.now());
    world.asyncExecution = true;
    const removing = remove();
    await vi.advanceTimersByTimeAsync(10_500);
    await removing;
    expect(coordinator.getView(answer.answerId)).toEqual({ kind: 'unconfirmed', trackerKept: true });
    expect(await store.getTracker(answer.answerId)).not.toBeNull();
    expect((await drafts.load(editIdentity))?.text).toBe('남을 수정 합성');
  });

  test('edit and delete of one answer share one lock: a delete joins the running edit', async () => {
    const { world, answer, saveEdit, remove, ops } = await setup();
    let release!: () => void;
    world.addFault('OP-006', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    const editing = saveEdit('먼저 고친 합성');
    await vi.waitFor(() => expect(ops('OP-006')).toBe(1));
    const deleting = remove();
    release();
    await Promise.all([editing, deleting]);
    expect(ops('OP-012')).toBe(0);
    expect(world.answers.get(answer.answerId)?.content).toBe('먼저 고친 합성');
  });

  test('create and answer namespaces never share records for the same id string', async () => {
    const { store, createStore, answer, remove } = await setup();
    await remove();
    await createStore.putTracker(answer.answerId, {
      recordType: 'command',
      kind: 'ANSWER_WRITE',
      operationId: 'op-x',
      prepareInput: {
        mode: 'CREATE',
        dailySemaId: answer.answerId,
        semaId: 's',
        semaVersion: 'v',
        questionId: 'q',
        questionVersion: 'v',
      },
      executeIntent: true,
      networkAllowed: false,
      ticketId: null,
      outcome: null,
      createdAt: 0,
    });
    expect(await store.getTracker(answer.answerId)).toBeNull();
    expect((await createStore.listTargets()).includes(answer.answerId)).toBe(true);
    expect(await store.listTargets()).toEqual([]);
  });
});
