import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { createArcaApi } from '../../data/api/arcaApi.ts';
import { createHttpTransport } from '../../data/api/transport.ts';
import { createHandlers, mockErrors } from '../../mocks/handlers.ts';
import { createFakePlatform } from '../../mocks/platform.ts';
import { createMockWorld, MOCK_API_BASE, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import {
  IdentityUnavailableFailure,
  SessionChangedFailure,
  SessionController,
  type SessionEvent,
  StaleResultFailure,
} from './sessionController.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup(options: { base?: Parameters<typeof createMockWorld>[0]; key?: string; now?: () => number } = {}) {
  const world = createMockWorld(options.base ?? 'server.activeUnanswered');
  server.use(...createHandlers(world));
  const api = createArcaApi(createHttpTransport({ baseUrl: MOCK_API_BASE }));
  const platform = createFakePlatform({
    anonymousKey: { kind: 'ok', key: options.key ?? SYNTHETIC_KEYS.registered },
    ...(options.now ? { now: options.now } : {}),
  });
  const session = new SessionController({ api, identity: platform.identity, clock: platform.clock });
  const events: SessionEvent[] = [];
  session.subscribe((event) => events.push(event));
  const getToday = () => session.run('ACTIVE', (auth) => api.getToday(auth, 'EXPANDED'));
  return { world, api, platform, session, events, getToday };
}

const op001Count = (world: ReturnType<typeof createMockWorld>) =>
  world.requests.filter((r) => r.op === 'OP-001').length;

describe('MS-SES-001 establish by registration state', () => {
  test('unregistered key → PRE_PASSENGER without creating a passenger', async () => {
    const { session, world } = setup({ base: 'server.prePassenger', key: SYNTHETIC_KEYS.unregistered });
    const summary = await session.establish();
    expect(summary.mode).toBe('PRE_PASSENGER');
    expect(summary.generation).toBeNull();
    expect(world.passengers.size).toBe(0);
  });

  test('registered key → ACTIVE with generation and a random owner scope', async () => {
    const { session } = setup();
    const summary = await session.establish();
    expect(summary).toMatchObject({ mode: 'ACTIVE', generation: 'gen-synthetic-1', epoch: 1 });
    expect(summary.ownerScope).not.toContain(SYNTHETIC_KEYS.registered);
  });

  test('concurrent callers share one OP-001', async () => {
    const { session, world } = setup();
    const [a, b] = await Promise.all([session.establish(), session.establish()]);
    expect(a).toBe(b);
    expect(op001Count(world)).toBe(1);
  });
});

describe('MS-SES-002 anonymous key unavailable', () => {
  test.each(['unsupported', 'error', 'empty', 'timeout'] as const)('%s → no OP-001, no fallback', async (reason) => {
    const { session, platform, world } = setup();
    platform.setAnonymousKey({ kind: 'unavailable', reason });
    await expect(session.establish()).rejects.toBeInstanceOf(IdentityUnavailableFailure);
    expect(op001Count(world)).toBe(0);
    expect(session.summary).toBeNull();
    expect(platform.storage.data.size).toBe(0);
  });

  test('retry repeats the latest key judgement', async () => {
    const { session, platform } = setup();
    platform.setAnonymousKey({ kind: 'unavailable', reason: 'error' });
    await expect(session.establish()).rejects.toBeInstanceOf(IdentityUnavailableFailure);
    platform.setAnonymousKey({ kind: 'ok', key: SYNTHETIC_KEYS.registered });
    await expect(session.establish()).resolves.toMatchObject({ mode: 'ACTIVE' });
  });
});

describe('MS-SES-003 recoverable session on the same owner', () => {
  test('re-establishes once, replays once, keeps owner scope', async () => {
    const { session, world, events, getToday } = setup();
    const first = await session.establish();
    world.revokeSessions(SYNTHETIC_KEYS.registered);

    await expect(getToday()).resolves.toMatchObject({ dateKst: '2026-09-27' });
    expect(op001Count(world)).toBe(2);
    expect(world.requests.filter((r) => r.op === 'OP-005')).toHaveLength(2);
    expect(session.summary).toMatchObject({ ownerScope: first.ownerScope, epoch: 2 });
    expect(events.at(-1)).toMatchObject({ kind: 'established', ownerChanged: false });
  });

  test('a second recovery request in the same action is not replayed again', async () => {
    const { session, world, getToday } = setup();
    await session.establish();
    world.addFault('OP-005', mockErrors.sessionRecoveryRequired, mockErrors.sessionRecoveryRequired);
    await expect(getToday()).rejects.toMatchObject({ code: 'SESSION_RECOVERY_REQUIRED' });
    expect(world.requests.filter((r) => r.op === 'OP-005')).toHaveLength(2);
    expect(op001Count(world)).toBe(2);
  });

  test('an old-epoch response is not applied', async () => {
    const { session, world, getToday } = setup();
    await session.establish();
    let release!: () => void;
    world.addFault('OP-005', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });

    const pending = getToday();
    await Promise.resolve();
    await session.establish();
    release();
    await expect(pending).rejects.toBeInstanceOf(StaleResultFailure);
  });

  test('timeouts and generic 401 do not trigger recovery', async () => {
    const { session, world, getToday } = setup();
    await session.establish();
    world.addFault('OP-005', { kind: 'network' }, { kind: 'network' });
    await expect(getToday()).rejects.toMatchObject({ name: 'TransportFailure' });
    expect(op001Count(world)).toBe(1);
  });
});

describe('MS-SES-004 owner or generation change on re-establish', () => {
  test('generation change aborts the replay and signals owner change', async () => {
    const { session, world, events, getToday } = setup();
    const first = await session.establish();
    world.revokeSessions(SYNTHETIC_KEYS.registered);
    const passenger = world.passengers.get(SYNTHETIC_KEYS.registered);
    if (passenger) passenger.dataGeneration = 'gen-synthetic-2';

    await expect(getToday()).rejects.toBeInstanceOf(SessionChangedFailure);
    expect(world.requests.filter((r) => r.op === 'OP-005')).toHaveLength(1);
    expect(session.summary?.ownerScope).not.toBe(first.ownerScope);
    expect(events.at(-1)).toMatchObject({ kind: 'established', ownerChanged: true });
  });

  test('ACTIVE → PRE_PASSENGER is an owner change', async () => {
    const { session, world, events } = setup();
    await session.establish();
    world.passengers.clear();
    await session.establish();
    expect(session.summary?.mode).toBe('PRE_PASSENGER');
    expect(events.at(-1)).toMatchObject({ ownerChanged: true });
  });
});

describe('proactive refresh', () => {
  test('re-establishes before a request inside the expiry margin', async () => {
    let now = Date.parse('2026-09-27T14:00:00Z');
    const { session, world, getToday } = setup({ now: () => now });
    await session.establish();
    now = Date.parse('2026-09-27T14:59:30Z');
    await getToday();
    expect(op001Count(world)).toBe(2);
  });

  test('foreground entry refreshes only inside the margin; a normal refresh keeps the owner (epoch only)', async () => {
    let now = Date.parse('2026-09-27T14:00:00Z');
    const { session, world, events } = setup({ now: () => now });
    const first = await session.establish();
    await session.refreshOnForeground();
    expect(op001Count(world)).toBe(1);
    now = Date.parse('2026-09-27T14:59:30Z');
    await session.refreshOnForeground();
    expect(op001Count(world)).toBe(2);
    const last = events.at(-1);
    expect(last?.kind === 'established' && last.ownerChanged).toBe(false);
    expect(last?.kind === 'established' && last.summary.epoch).toBeGreaterThan(first.epoch);
  });
});

describe('fence on every re-establishment path', () => {
  test('proactive refresh into a new generation aborts the call (no replay under the new owner)', async () => {
    let now = Date.parse('2026-09-27T14:00:00Z');
    const { session, world, getToday } = setup({ now: () => now });
    await session.establish();
    const passenger = world.passengers.get(SYNTHETIC_KEYS.registered);
    if (passenger) passenger.dataGeneration = 'gen-synthetic-2';
    now = Date.parse('2026-09-27T14:59:30Z');
    await expect(getToday()).rejects.toBeInstanceOf(SessionChangedFailure);
    expect(world.requests.filter((r) => r.op === 'OP-005')).toHaveLength(0);
  });

  test('a stale outcome keeps its original result or error', async () => {
    const { session, world, getToday } = setup();
    await session.establish();
    let release!: () => void;
    world.addFault('OP-005', {
      kind: 'hold',
      release: new Promise<void>((r) => (release = r)),
      after: mockErrors.maintenance,
    });
    const pending = getToday();
    await Promise.resolve();
    await session.establish();
    release();
    const failure = await pending.catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(StaleResultFailure);
    expect((failure as StaleResultFailure).outcome).toMatchObject({ kind: 'error', error: { code: 'MAINTENANCE' } });
    expect(JSON.stringify(failure)).not.toContain('MAINTENANCE');
    expect(Object.keys(failure as object)).not.toContain('outcome');
  });

  test('a failed recovery re-establish discards the session', async () => {
    const { session, world, platform, events, getToday } = setup();
    await session.establish();
    world.revokeSessions(SYNTHETIC_KEYS.registered);
    platform.setAnonymousKey({ kind: 'unavailable', reason: 'error' });
    await expect(getToday()).rejects.toBeInstanceOf(IdentityUnavailableFailure);
    expect(session.summary).toBeNull();
    expect(events.at(-1)).toEqual({ kind: 'discarded' });
  });
});

describe('OP-003 createPassenger recovery (06 §9.1, §8.1)', () => {
  const consents = [
    { policyId: 'terms-of-service', version: 'synthetic-v1' },
    { policyId: 'privacy-policy', version: 'synthetic-v1' },
  ];

  test('without a local owner verifier, an unknown outcome is not resent automatically', async () => {
    const { session, world, events } = setup({ base: 'server.prePassenger' });
    await session.establish();
    world.addFault('OP-003', { kind: 'lose-response' });

    await expect(session.createPassenger('synthetic-op-1', consents, null)).rejects.toThrow();
    expect(world.requests.filter((r) => r.op === 'OP-003')).toHaveLength(1);
    expect(op001Count(world)).toBe(1);
    // The created passenger is not claimed: no ACTIVE session was applied.
    expect(session.summary?.mode).toBe('PRE_PASSENGER');
    expect(events.some((e) => e.kind === 'established' && e.boarded)).toBe(false);
  });

  test('a changed key never receives the stored creation ID', async () => {
    const { session, world, platform } = setup({ base: 'server.prePassenger', key: SYNTHETIC_KEYS.unregistered });
    await session.establish();
    const verifier = await session.localOwnerVerifier();
    expect(verifier).not.toBeNull();
    world.addFault('OP-003', { kind: 'lose-response' });
    platform.setAnonymousKey({ kind: 'ok', key: 'synthetic-anon-key-other' });

    await expect(session.createPassenger('synthetic-op-2', consents, verifier)).rejects.toBeInstanceOf(
      SessionChangedFailure,
    );
    expect(world.requests.filter((r) => r.op === 'OP-003')).toHaveLength(1);
  });
});
