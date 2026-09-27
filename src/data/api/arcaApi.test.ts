import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { createHandlers, mockErrors } from '../../mocks/handlers.ts';
import { createMockWorld, MOCK_API_BASE, type MockWorld, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { DomainFailure, ProtocolFailure, TransportFailure } from '../failures.ts';
import { createArcaApi } from './arcaApi.ts';
import { createHttpTransport } from './transport.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup(base: Parameters<typeof createMockWorld>[0] = 'server.activeUnanswered') {
  const world = createMockWorld(base);
  server.use(...createHandlers(world));
  const api = createArcaApi(createHttpTransport({ baseUrl: MOCK_API_BASE }));
  return { world, api };
}

async function activeBearer(world: MockWorld) {
  return { bearer: world.issueToken(SYNTHETIC_KEYS.registered) };
}

describe('OP-001 establishSession', () => {
  test('registered key maps to ACTIVE with generation', async () => {
    const { api } = setup();
    const session = await api.establishSession(SYNTHETIC_KEYS.registered);
    expect(session.context).toEqual({ mode: 'ACTIVE', dataGeneration: 'gen-synthetic-1' });
    expect(session.accessToken).toMatch(/^synthetic-token-/);
  });

  test('unregistered key maps to PRE_PASSENGER and creates nothing', async () => {
    const { api, world } = setup('server.prePassenger');
    const session = await api.establishSession(SYNTHETIC_KEYS.unregistered);
    expect(session.context).toEqual({ mode: 'PRE_PASSENGER' });
    expect(world.passengers.size).toBe(0);
  });

  test('known error code becomes DomainFailure with display request id', async () => {
    const { api, world } = setup();
    world.addFault('OP-001', mockErrors.anonymousKeyInvalid);
    const failure = await api.establishSession(SYNTHETIC_KEYS.registered).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(DomainFailure);
    expect(failure).toMatchObject({ code: 'ANONYMOUS_KEY_INVALID', category: 'AUTH' });
  });

  test('extra error fields are dropped, never surfaced', async () => {
    const { api, world } = setup();
    world.addFault('OP-001', mockErrors.internalWithExtra);
    const failure = await api.establishSession(SYNTHETIC_KEYS.registered).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(DomainFailure);
    expect(JSON.stringify(failure)).not.toContain('leak');
    expect(Object.keys(failure as object)).not.toContain('stack');
  });

  test('unknown error code or schema mismatch is a ProtocolFailure', async () => {
    const { api, world } = setup();
    world.addFault('OP-001', {
      kind: 'error',
      status: 401,
      body: { error: { code: 'NEW', category: 'AUTH', requestId: 'r' } },
    });
    await expect(api.establishSession(SYNTHETIC_KEYS.registered)).rejects.toBeInstanceOf(ProtocolFailure);
    world.addFault('OP-001', { kind: 'malformed' });
    await expect(api.establishSession(SYNTHETIC_KEYS.registered)).rejects.toBeInstanceOf(ProtocolFailure);
  });

  test('connection loss is a TransportFailure and OP-001 is not retried', async () => {
    const { api, world } = setup();
    world.addFault('OP-001', { kind: 'network' });
    await expect(api.establishSession(SYNTHETIC_KEYS.registered)).rejects.toBeInstanceOf(TransportFailure);
    expect(world.requests.filter((r) => r.op === 'OP-001')).toHaveLength(1);
  });

  test('missing API base is a not-configured TransportFailure without any request', async () => {
    const api = createArcaApi(createHttpTransport({ baseUrl: undefined }));
    await expect(api.establishSession(SYNTHETIC_KEYS.registered)).rejects.toMatchObject({ reason: 'not-configured' });
  });
});

describe('OP-005 getToday', () => {
  test('maps the read model and sends bearer only in the header', async () => {
    const { api, world } = setup();
    const today = await api.getToday(await activeBearer(world), 'EXPANDED');
    expect(today.answer).toEqual({ state: 'UNANSWERED' });
    expect(today.sema.primaryQuestion.role).toBe('PRIMARY');
    expect(world.requests.at(-1)?.bearer).toMatch(/^synthetic-token-/);
  });

  test('safe query retries a connectivity failure exactly once', async () => {
    const { api, world } = setup();
    world.addFault('OP-005', { kind: 'network' });
    await expect(api.getToday(await activeBearer(world), 'EXPANDED')).resolves.toBeDefined();
    world.addFault('OP-005', { kind: 'network' }, { kind: 'network' });
    await expect(api.getToday(await activeBearer(world), 'EXPANDED')).rejects.toBeInstanceOf(TransportFailure);
    expect(world.requests.filter((r) => r.op === 'OP-005')).toHaveLength(4);
  });

  test('domain errors are not retried', async () => {
    const { api, world } = setup();
    world.addFault('OP-005', mockErrors.maintenance);
    await expect(api.getToday(await activeBearer(world), 'EXPANDED')).rejects.toMatchObject({ code: 'MAINTENANCE' });
    expect(world.requests.filter((r) => r.op === 'OP-005')).toHaveLength(1);
  });

  test('recovery-required error exposes recoveryAllowed', async () => {
    const { api, world } = setup();
    world.addFault('OP-005', mockErrors.sessionRecoveryRequired);
    await expect(api.getToday(await activeBearer(world), 'EXPANDED')).rejects.toMatchObject({
      code: 'SESSION_RECOVERY_REQUIRED',
      recoveryAllowed: true,
    });
  });
});

describe('transport budget covers the body (06 §6.2)', () => {
  test('headers then a stalled body end as a timeout TransportFailure', async () => {
    const stalled: typeof fetch = async (_input, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
          },
        }),
        { status: 200 },
      );
    const transport = createHttpTransport({ baseUrl: MOCK_API_BASE, fetch: stalled });
    await expect(transport({ method: 'GET', path: '/today', timeoutMs: 30 })).rejects.toMatchObject({
      reason: 'timeout',
    });
  });

  test('an already-aborted caller signal sends nothing', async () => {
    let calls = 0;
    const counting: typeof fetch = async () => {
      calls += 1;
      return new Response('{}');
    };
    const transport = createHttpTransport({ baseUrl: MOCK_API_BASE, fetch: counting });
    const controller = new AbortController();
    controller.abort();
    await expect(
      transport({ method: 'GET', path: '/today', timeoutMs: 1_000, signal: controller.signal }),
    ).rejects.toMatchObject({ reason: 'aborted' });
    expect(calls).toBe(0);
  });
});
