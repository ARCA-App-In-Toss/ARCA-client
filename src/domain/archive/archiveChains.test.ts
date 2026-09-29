import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createArcaApi } from '../../data/api/arcaApi.ts';
import { createHttpTransport } from '../../data/api/transport.ts';
import { createHandlers } from '../../mocks/handlers.ts';
import { createFakePlatform } from '../../mocks/platform.ts';
import { createMockWorld, MOCK_API_BASE, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { SessionController } from '../session/sessionController.ts';
import { ArchiveChains } from './archiveChains.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function setup() {
  const world = createMockWorld('server.activeUnanswered');
  server.use(...createHandlers(world));
  const seeded = [1, 2, 3].map((i) =>
    world.seedAnswer(SYNTHETIC_KEYS.registered, `합성 ${i}`, {
      dailySemaId: `d-${i}`,
      createdAt: `2026-09-0${i}T01:00:00Z`,
      createdDateKst: `2026-09-0${i}`,
    }),
  );
  const platform = createFakePlatform();
  const api = createArcaApi(createHttpTransport({ baseUrl: MOCK_API_BASE }));
  const session = new SessionController({ api, identity: platform.identity, clock: platform.clock });
  await session.establish();
  let scope: { ownerScope: string; generation: string } | null = { ownerScope: 'o', generation: 'g1' };
  const chains = new ArchiveChains({ session, api, scope: () => scope });
  chains.enter({ routeEpoch: 1, atTop: () => true });
  await vi.waitFor(() => expect(chains.getView().phase).toBe('ready'));
  const addNewer = () =>
    world.seedAnswer(SYNTHETIC_KEYS.registered, '새 합성', {
      dailySemaId: 'd-new',
      createdAt: '2026-09-09T01:00:00Z',
      createdDateKst: '2026-09-09',
    });
  return {
    world,
    chains,
    seeded,
    addNewer,
    setScope: (next: typeof scope) => {
      scope = next;
    },
  };
}

const texts = (chains: ArchiveChains) =>
  chains.getView().items.map((item) => (item.excerpt.state === 'AVAILABLE' ? item.excerpt.value.text : null));

describe('ArchiveChains candidate and patches', () => {
  test('a held candidate is dropped by an edit patch and by a delete; rows never mix with it', async () => {
    const { chains, seeded, addNewer } = await setup();
    addNewer();
    await chains.refresh(() => false);
    expect(chains.getView().candidateReady).toBe(true);
    expect(texts(chains)).toEqual(['합성 3', '합성 2', '합성 1']);

    const target = seeded[1];
    chains.patchRow(target?.answerId ?? '', 'a-r1', {
      revision: 'a-r9',
      excerpt: { sourceRevision: 'a-r9', text: '고친 합성 2', isTruncated: false },
    });
    expect(chains.getView().candidateReady).toBe(false);
    expect(texts(chains)).toEqual(['합성 3', '고친 합성 2', '합성 1']);

    await chains.refresh(() => false);
    expect(chains.getView().candidateReady).toBe(true);
    chains.removeRow(seeded[2]?.answerId ?? '');
    expect(chains.getView().candidateReady).toBe(false);
    expect(texts(chains)).toEqual(['고친 합성 2', '합성 1']);
  });

  test('an edit patch applies only at the base revision and only with an excerpt of the new revision', async () => {
    const { chains, seeded } = await setup();
    const id = seeded[0]?.answerId ?? '';
    chains.patchRow(id, 'a-r-other', { revision: 'a-r9', excerpt: null });
    expect(chains.getView().items.find((i) => i.answerId === id)?.revision).toBe('a-r1');
    chains.patchRow(id, 'a-r1', {
      revision: 'a-r9',
      excerpt: { sourceRevision: 'a-r8', text: '옛 발췌', isTruncated: false },
    });
    const row = chains.getView().items.find((i) => i.answerId === id);
    expect(row?.revision).toBe('a-r9');
    expect(row?.excerpt.state).toBe('UNAVAILABLE');
  });

  test('delete moves the anchor to the neighbour; owner/generation change drops chain and anchor', async () => {
    const { chains, seeded, setScope } = await setup();
    chains.saveAnchor({ answerId: seeded[1]?.answerId ?? '', viewportOffset: 120, routeEpoch: 1 });
    chains.removeRow(seeded[1]?.answerId ?? '');
    const anchor = chains.enter({ routeEpoch: 1, atTop: () => true });
    expect(anchor?.answerId).toBe(seeded[0]?.answerId);
    expect(anchor?.viewportOffset).toBe(120);

    chains.saveAnchor({ answerId: seeded[0]?.answerId ?? '', viewportOffset: 10, routeEpoch: 1 });
    setScope({ ownerScope: 'o', generation: 'g2' });
    expect(chains.enter({ routeEpoch: 1, atTop: () => true })).toBeNull();
    expect(chains.getView().phase).toBe('loading');
  });

  test('after a settled edit/delete, the next entry restores the anchor and still re-reads the first page', async () => {
    const { chains, world, seeded } = await setup();
    const reads = () => world.requests.filter((r) => r.op === 'OP-010').length;
    chains.saveAnchor({ answerId: seeded[0]?.answerId ?? '', viewportOffset: 40, routeEpoch: 1 });
    expect(chains.enter({ routeEpoch: 1, atTop: () => false })).not.toBeNull();
    expect(reads()).toBe(1);

    chains.saveAnchor({ answerId: seeded[0]?.answerId ?? '', viewportOffset: 40, routeEpoch: 1 });
    world.answers.delete(seeded[2]?.answerId ?? '');
    chains.removeRow(seeded[2]?.answerId ?? '');
    expect(chains.enter({ routeEpoch: 1, atTop: () => false })).not.toBeNull();
    await vi.waitFor(() => expect(reads()).toBe(2));
    expect(chains.getView().candidateReady).toBe(false);
    chains.saveAnchor({ answerId: seeded[0]?.answerId ?? '', viewportOffset: 40, routeEpoch: 1 });
    chains.enter({ routeEpoch: 1, atTop: () => false });
    expect(reads()).toBe(2);
  });

  test('a late first-page response for a replaced chain is dropped', async () => {
    const { chains, world, addNewer, setScope } = await setup();
    let release!: () => void;
    world.addFault('OP-010', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    addNewer();
    const refreshing = chains.refresh(() => true);
    setScope({ ownerScope: 'o2', generation: 'g1' });
    chains.reset();
    release();
    await refreshing;
    expect(chains.getView().items).toEqual([]);
  });
});
