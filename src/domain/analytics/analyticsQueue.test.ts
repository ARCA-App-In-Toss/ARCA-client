import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { createArcaApi } from '../../data/api/arcaApi.ts';
import { zProductEventBatchInput } from '../../data/api/generated/zod.gen.ts';
import { createHttpTransport } from '../../data/api/transport.ts';
import { createHandlers, mockErrors } from '../../mocks/handlers.ts';
import { createFakePlatform } from '../../mocks/platform.ts';
import { createMockWorld, MOCK_API_BASE, type Passenger, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import type { Timers } from '../drafts/draftWriter.ts';
import { SessionController } from '../session/sessionController.ts';
import { AnalyticsQueue, MAX_BATCH_EVENTS, MAX_QUEUED_EVENTS, RETRY_DELAYS_MS } from './analyticsQueue.ts';
import type { ProductEvent } from './productEvent.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BE_EVENTS = ['onboarding_completed', 'answer_saved', 'answer_edited', 'answer_deleted', 'all_data_deleted'];

function manualTimers() {
  const pending: { callback: () => void; ms: number }[] = [];
  const timers: Timers = {
    set(callback, ms) {
      const entry = { callback, ms };
      pending.push(entry);
      return entry;
    },
    clear(handle) {
      const index = pending.indexOf(handle as (typeof pending)[number]);
      if (index >= 0) pending.splice(index, 1);
    },
  };
  return {
    timers,
    pending,
    fire() {
      const next = pending.shift();
      next?.callback();
      return next?.ms;
    },
  };
}

async function setup(options: { base?: Parameters<typeof createMockWorld>[0]; key?: string } = {}) {
  const world = createMockWorld(options.base ?? 'server.activeUnanswered');
  server.use(...createHandlers(world));
  const bodies: unknown[] = [];
  const baseFetch = globalThis.fetch;
  const fetchSpy: typeof fetch = async (input, init) => {
    if (String(input).includes('/analytics/event-batches') && typeof init?.body === 'string') {
      bodies.push(JSON.parse(init.body));
    }
    return baseFetch(input, init);
  };
  const api = createArcaApi(createHttpTransport({ baseUrl: MOCK_API_BASE, fetch: fetchSpy }));
  const platform = createFakePlatform({ anonymousKey: { kind: 'ok', key: options.key ?? SYNTHETIC_KEYS.registered } });
  const session = new SessionController({ api, identity: platform.identity, clock: platform.clock });
  await session.establish();
  const clock = manualTimers();
  const queue = new AnalyticsQueue({ session, api, clock: platform.clock, appVersion: '0.0.0', timers: clock.timers });
  return { world, session, queue, clock, bodies };
}

const viewed: ProductEvent = { name: 'today_sema_viewed', properties: { answerState: 'UNANSWERED' } };
const op014 = (world: ReturnType<typeof createMockWorld>) => world.requests.filter((r) => r.op === 'OP-014').length;

describe('MS-ANALYTICS-002 bounded memory queue and best-effort flush', () => {
  test('20 recorded events flush as one batch; the batch carries only allowlisted fields', async () => {
    const { queue, world, bodies } = await setup();
    for (let i = 0; i < MAX_BATCH_EVENTS - 1; i += 1) queue.record(viewed);
    expect(op014(world)).toBe(0);
    queue.record({ name: 'answer_started', properties: { mode: 'CREATE' } });
    await queue.flush();
    expect(op014(world)).toBe(1);
    expect(world.productEvents.size).toBe(MAX_BATCH_EVENTS);
    expect(queue.pending).toBe(0);
    const [body] = bodies;
    expect(zProductEventBatchInput.safeParse(body).success).toBe(true);
    expect(Object.keys(body as object).sort()).toEqual(['appVersion', 'events']);
    for (const event of (body as { events: Record<string, unknown>[] }).events) {
      expect(Object.keys(event).sort()).toEqual(['eventId', 'name', 'occurredAt', 'properties', 'schemaVersion']);
      expect(event.schemaVersion).toBe(1);
    }
  });

  test('queue holds at most 100: the 101st drops the oldest; batches never exceed 20', async () => {
    const { queue, world, bodies } = await setup();
    world.addFault('OP-014', ...Array.from({ length: 5 }, () => ({ kind: 'network' as const })));
    for (let i = 0; i < MAX_QUEUED_EVENTS + 1; i += 1) queue.record(viewed);
    await queue.flush();
    expect(queue.pending).toBe(MAX_QUEUED_EVENTS);
    world.faults.clear();
    queue.hint();
    await queue.flush();
    expect(queue.pending).toBe(0);
    expect(world.productEvents.size).toBe(MAX_QUEUED_EVENTS);
    for (const body of bodies) expect((body as { events: unknown[] }).events.length).toBeLessThanOrEqual(20);
  });

  test('flush failure keeps events and retries with bounded backoff, reusing the same event IDs', async () => {
    const { queue, world, clock, bodies } = await setup();
    world.addFault('OP-014', { kind: 'network' }, { kind: 'network' }, mockErrors.maintenance, mockErrors.maintenance);
    queue.record(viewed);
    await queue.flush();
    expect(queue.pending).toBe(1);
    const delays: (number | undefined)[] = [];
    while (clock.pending.length > 0) {
      delays.push(clock.fire());
      await queue.flush();
    }
    expect(delays).toEqual([...RETRY_DELAYS_MS]);
    expect(queue.pending).toBe(1);
    const ids = new Set(bodies.map((body) => (body as { events: { eventId: string }[] }).events[0]?.eventId));
    expect(ids.size).toBe(1);
    world.faults.clear();
    queue.hint();
    await queue.flush();
    expect(queue.pending).toBe(0);
    expect(world.productEvents.size).toBe(1);
  });

  test('a new queue after reload starts empty: unsent events may be lost', async () => {
    const first = await setup();
    first.queue.record(viewed);
    const reloaded = new AnalyticsQueue({
      session: first.session,
      api: createArcaApi(createHttpTransport({ baseUrl: MOCK_API_BASE })),
      clock: { now: () => Date.now() },
    });
    expect(reloaded.pending).toBe(0);
  });

  test('generation change discards queued and in-flight events of the old generation', async () => {
    const { queue, world, session } = await setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    world.addFault('OP-014', { kind: 'hold', release: held, after: { kind: 'network' } });
    queue.record(viewed);
    const inFlight = queue.flush();
    queue.record(viewed);
    expect(queue.pending).toBe(1);
    (world.passengers.get(SYNTHETIC_KEYS.registered) as Passenger).dataGeneration = 'gen-synthetic-2';
    await session.establish();
    expect(queue.pending).toBe(0);
    release();
    await inFlight;
    expect(queue.pending).toBe(0);
    expect(world.productEvents.size).toBe(0);

    queue.record({ name: 'archive_viewed', properties: { state: 'EMPTY' } });
    queue.hint();
    await queue.flush();
    expect([...world.productEvents.values()].map((e) => e.name)).toEqual(['archive_viewed']);
  });

  test('PRE_PASSENGER events survive boarding; discardAll drops everything', async () => {
    const { queue, world } = await setup({ base: 'server.prePassenger', key: SYNTHETIC_KEYS.unregistered });
    queue.record({ name: 'onboarding_started', properties: {} });
    queue.record({ name: 'onboarding_skipped', properties: {} });
    await queue.flush();
    expect([...world.productEvents.values()].map((e) => e.name)).toEqual(['onboarding_started', 'onboarding_skipped']);
    queue.record({ name: 'onboarding_started', properties: {} });
    queue.discardAll();
    expect(queue.pending).toBe(0);
  });

  test('FE never produces BE-owned success events', async () => {
    const { queue, world } = await setup();
    queue.record(viewed);
    queue.record({ name: 'answer_started', properties: { mode: 'CREATE' } });
    await queue.flush();
    const names = [...world.productEvents.values()].map((e) => e.name);
    for (const name of BE_EVENTS) expect(names).not.toContain(name);
  });
});
