import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createArcaApi } from '../../data/api/arcaApi.ts';
import { createHttpTransport } from '../../data/api/transport.ts';
import { type ManifestScope, StorageJournal } from '../../data/storage/journal.ts';
import { createHandlers } from '../../mocks/handlers.ts';
import { createFakePlatform } from '../../mocks/platform.ts';
import { createMockWorld, MOCK_API_BASE } from '../../mocks/world.ts';
import { SessionController } from '../session/sessionController.ts';
import { NicknameCoordinator } from './nicknameCoordinator.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

async function setup(options: { fenced?: () => boolean } = {}) {
  const world = createMockWorld('server.activeUnanswered');
  server.use(...createHandlers(world));
  const platform = createFakePlatform();
  const api = createArcaApi(createHttpTransport({ baseUrl: MOCK_API_BASE }));
  const session = new SessionController({ api, identity: platform.identity, clock: platform.clock });
  await session.establish();
  const journal = new StorageJournal(platform.storage, platform.clock);
  const areaA: ManifestScope = { kind: 'generation', ref: 'area-a' };
  await journal.initArea(areaA);
  await journal.putRecord(areaA, 'setNickname', {
    operationId: '66d9e9af-2026-4000-8000-0000000000a1',
    nickname: '항해자',
    expectedRevision: 'p-r1',
  });
  let area: ManifestScope | null = areaA;
  const nickname = new NicknameCoordinator({
    session,
    api,
    journal,
    network: platform.network,
    area: () => area,
    syncProfile: async () => undefined,
    ...(options.fenced ? { deletionFenced: options.fenced } : {}),
  });
  const ops = () => world.requests.filter((r) => r.op === 'OP-004').length;
  return { world, journal, nickname, areaA, ops, moveArea: () => (area = { kind: 'generation', ref: 'area-b' }) };
}

describe('nickname resume (06 §9.1, §4.2)', () => {
  test('same key restores the receipt once and removes the tracker', async () => {
    const { nickname, journal, areaA, ops, world } = await setup();
    await nickname.resume();
    expect(ops()).toBe(1);
    expect(world.nicknameReceipts).toHaveLength(1);
    expect(await journal.getRecord(areaA, 'setNickname')).toBeNull();
  });

  test('owner/generation area moves while reading: nothing is sent, the record is untouched', async () => {
    const { nickname, journal, areaA, ops, moveArea } = await setup();
    const original = journal.getRecord.bind(journal);
    vi.spyOn(journal, 'getRecord').mockImplementationOnce(async (...args) => {
      const found = await original(...args);
      moveArea();
      return found;
    });
    await nickname.resume();
    expect(ops()).toBe(0);
    expect(await original(areaA, 'setNickname')).not.toBeNull();
  });
});

describe('nickname behind the full-deletion fence (06 §9.3)', () => {
  test('neither a new save nor a resume is sent while the fence holds', async () => {
    const { nickname, ops } = await setup({ fenced: () => true });
    await expect(nickname.save('새 항해자', 'p-r1')).resolves.toBe('rejected');
    await nickname.resume();
    expect(ops()).toBe(0);
  });
});
