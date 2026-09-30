import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { DomainFailure, ProtocolFailure, TransportFailure } from '../../domain/failures.ts';
import { createHandlers, mockErrors } from '../../mocks/handlers.ts';
import { createMockWorld, MOCK_API_BASE, type MockWorld, SYNTHETIC_KEYS } from '../../mocks/world.ts';
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

describe('OP-015 closeAnswerWrite', () => {
  const sealed = {
    ticketId: 'synthetic-ticket-1',
    operationId: '66d9e9af-2026-4000-8000-000000000001',
    kind: 'ANSWER_WRITE',
    target: { mode: 'CREATE', dailySemaId: 'synthetic-day' },
    acceptedAt: '2026-09-20T01:59:00Z',
    acceptedDateKst: '2026-09-20',
    executeBy: '2026-09-20T14:59:59Z',
    state: 'CLOSED_OUTCOME_UNAVAILABLE',
    executionSealed: true,
    reconciliation: {
      checkedAt: '2026-09-27T02:00:00Z',
      nextAction: 'REVIEW_CURRENT_ANSWER',
      answerId: 'synthetic-answer-1',
      revision: 'a-r1',
    },
  };
  const replying = (status: number, body: unknown) =>
    createArcaApi(
      createHttpTransport({
        baseUrl: MOCK_API_BASE,
        fetch: async () =>
          new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
      }),
    );

  test('sealed past command maps its reconciliation', async () => {
    const result = await replying(200, sealed).closeAnswerWrite({ bearer: 't' }, 'synthetic-ticket-1', 1_000);
    expect(result).toEqual({
      state: 'CLOSED_OUTCOME_UNAVAILABLE',
      ticketId: 'synthetic-ticket-1',
      operationId: sealed.operationId,
      reconciliation: sealed.reconciliation,
    });
  });

  test('a status/body pairing outside the contract is a ProtocolFailure', async () => {
    const prepared = { ...sealed, state: 'PREPARED', executionSealed: undefined, reconciliation: undefined };
    await expect(replying(200, prepared).closeAnswerWrite({ bearer: 't' }, 'x', 1_000)).rejects.toBeInstanceOf(
      ProtocolFailure,
    );
    await expect(replying(202, sealed).closeAnswerWrite({ bearer: 't' }, 'x', 1_000)).rejects.toBeInstanceOf(
      ProtocolFailure,
    );
  });

  test('PREPARED closes as NOT_APPLIED/COMMAND_CLOSED; a repeat returns the same result', async () => {
    const { world, api } = setup();
    const auth = await activeBearer(world);
    const input = {
      mode: 'CREATE' as const,
      dailySemaId: world.sema.dailySemaId,
      semaId: world.sema.semaId,
      semaVersion: world.sema.version,
      questionId: world.sema.primaryQuestion.questionId,
      questionVersion: world.sema.primaryQuestion.version,
    };
    const prepared = await api.prepareAnswerWrite(auth, '66d9e9af-2026-4000-8000-000000000002', input, 1_000);
    const first = await api.closeAnswerWrite(auth, prepared.ticketId, 1_000);
    const again = await api.closeAnswerWrite(auth, prepared.ticketId, 1_000);
    expect(first).toMatchObject({ state: 'NOT_APPLIED', error: { code: 'COMMAND_CLOSED' } });
    expect(again).toEqual(first);
  });
});

describe('MS-PROTOCOL-001 response validation', () => {
  type Rewrite = (body: Record<string, unknown>) => unknown;
  const CANARY = 'synthetic-raw-canary';

  function rewriting(rewrite: Rewrite) {
    const { world } = setup();
    const api = createArcaApi(
      createHttpTransport({
        baseUrl: MOCK_API_BASE,
        fetch: async (input, init) => {
          const response = await globalThis.fetch(input, init);
          const next = rewrite((await response.json()) as Record<string, unknown>);
          return new Response(next === undefined ? '' : JSON.stringify(next), {
            status: response.status,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      }),
    );
    return { world, api };
  }

  test('compatible added fields are ignored and never surfaced', async () => {
    const { world, api } = rewriting((body) => ({
      ...body,
      futureField: CANARY,
      sema: { ...(body.sema as object), futureNested: CANARY },
    }));
    const today = await api.getToday(await activeBearer(world), 'EXPANDED');
    expect(today.answer).toEqual({ state: 'UNANSWERED' });
    expect(JSON.stringify(today)).not.toContain(CANARY);
  });

  test.each<[string, Rewrite]>([
    ['a missing required field', ({ dateKst: _dateKst, ...rest }) => rest],
    ['an unknown required enum', (body) => ({ ...body, answer: { state: 'ARCHIVED', note: CANARY } })],
    ['an invalid date', (body) => ({ ...body, dateKst: '2026-13-01' })],
    [
      'an invalid instant',
      (body) => ({ ...body, activeAnswerCount: { state: 'AVAILABLE', value: { count: 1, observedAt: CANARY } } }),
    ],
    ['null where the field is not nullable', (body) => ({ ...body, sema: null })],
    ['an empty body', () => undefined],
  ])('%s is a ProtocolFailure without the raw body', async (_label, rewrite) => {
    const { world, api } = rewriting(rewrite);
    const failure = await api.getToday(await activeBearer(world), 'EXPANDED').catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ProtocolFailure);
    expect(`${String(failure)} ${JSON.stringify(failure)}`).not.toContain(CANARY);
  });

  test.each<[string, number, unknown]>([
    [
      'a code with a recovery kind it does not allow',
      401,
      {
        error: {
          code: 'SESSION_RECOVERY_REQUIRED',
          category: 'AUTH',
          requestId: 'r',
          recovery: { kind: 'REFRESH_TODAY', recoveryAllowed: true },
        },
      },
    ],
    [
      'a code without its required recovery',
      401,
      { error: { code: 'SESSION_RECOVERY_REQUIRED', category: 'AUTH', requestId: 'r' } },
    ],
    [
      'a code that has no recovery but carries one',
      503,
      {
        error: {
          code: 'MAINTENANCE',
          category: 'MAINTENANCE',
          requestId: 'r',
          recovery: { kind: 'REFRESH_TODAY', recoveryAllowed: true },
        },
      },
    ],
    ['a code with another category', 503, { error: { code: 'MAINTENANCE', category: 'AUTH', requestId: 'r' } }],
    ['an error with a raw message only', 500, { message: CANARY }],
  ])('%s is a ProtocolFailure', async (_label, status, body) => {
    const { world, api } = setup();
    world.addFault('OP-005', { kind: 'error', status, body });
    const failure = await api.getToday(await activeBearer(world), 'EXPANDED').catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ProtocolFailure);
    expect(`${String(failure)} ${JSON.stringify(failure)}`).not.toContain(CANARY);
  });

  test('a mutation response that fails validation is never read as a success', async () => {
    const { world, api } = rewriting((body) => (body.state === 'SUCCEEDED' ? { ...body, proof: null } : body));
    const auth = await activeBearer(world);
    const prepared = await api.prepareAnswerWrite(
      auth,
      '66d9e9af-2026-4000-8000-000000000031',
      {
        mode: 'CREATE',
        dailySemaId: world.sema.dailySemaId,
        semaId: world.sema.semaId,
        semaVersion: world.sema.version,
        questionId: world.sema.primaryQuestion.questionId,
        questionVersion: world.sema.primaryQuestion.version,
      },
      1_000,
    );
    await expect(api.executeAnswerWrite(auth, prepared.ticketId, '검증 실패 합성', 1_000)).rejects.toBeInstanceOf(
      ProtocolFailure,
    );
  });
});

describe('MS-PROTOCOL-002 stable error registry normalization', () => {
  const input = (world: MockWorld) => ({
    mode: 'CREATE' as const,
    dailySemaId: world.sema.dailySemaId,
    semaId: world.sema.semaId,
    semaVersion: world.sema.version,
    questionId: world.sema.primaryQuestion.questionId,
    questionVersion: world.sema.primaryQuestion.version,
  });
  const OPERATION = '66d9e9af-2026-4000-8000-000000000032';
  type Call = (api: ReturnType<typeof setup>['api'], world: MockWorld) => Promise<unknown>;
  const today: Call = async (api, world) => api.getToday(await activeBearer(world), 'EXPANDED');
  const prepare: Call = async (api, world) =>
    api.prepareAnswerWrite(await activeBearer(world), OPERATION, input(world), 1_000);
  const execute: Call = async (api, world) =>
    api.executeAnswerWrite(await activeBearer(world), 'synthetic-ticket-x', '합성', 1_000);
  const acknowledge: Call = async (api, world) =>
    api.acknowledgeCommand(await activeBearer(world), 'synthetic-ticket-x');
  const list: Call = async (api, world) => api.listAnswers(await activeBearer(world), 'c', 'COMPACT');

  test.each<[string, number, string, string, Call, Record<string, unknown>?]>([
    ['OP-005', 400, 'INVALID_REQUEST', 'VALIDATION', today],
    ['OP-005', 401, 'SESSION_INVALID', 'AUTH', today],
    [
      'OP-005',
      401,
      'SESSION_RECOVERY_REQUIRED',
      'AUTH',
      today,
      { recovery: { kind: 'REESTABLISH_SESSION', recoveryAllowed: true } },
    ],
    ['OP-005', 403, 'SESSION_SCOPE_INSUFFICIENT', 'AUTH', today],
    ['OP-005', 429, 'RATE_LIMITED', 'RATE_LIMIT', today, { retryAfterSeconds: 3 }],
    ['OP-005', 500, 'INTERNAL_ERROR', 'MAINTENANCE', today],
    ['OP-005', 503, 'MAINTENANCE', 'MAINTENANCE', today],
    ['OP-006', 409, 'ANSWER_ALREADY_EXISTS', 'CONFLICT', prepare],
    ['OP-006', 409, 'IDEMPOTENCY_KEY_REUSED', 'CONFLICT', prepare],
    [
      'OP-006',
      409,
      'COMMAND_ALREADY_PENDING',
      'CONFLICT',
      prepare,
      { recovery: { kind: 'QUERY_COMMAND', ticketId: 'synthetic-ticket-p' } },
    ],
    ['OP-006', 422, 'DATE_CHANGED', 'VALIDATION', prepare, { recovery: { kind: 'REFRESH_TODAY' } }],
    ['OP-006', 422, 'SEMA_REPLACED', 'VALIDATION', prepare, { recovery: { kind: 'REFRESH_TODAY' } }],
    ['OP-007', 404, 'COMMAND_NOT_FOUND', 'VALIDATION', execute],
    ['OP-007', 422, 'COMMAND_PAYLOAD_MISMATCH', 'VALIDATION', execute],
    ['OP-009', 409, 'COMMAND_NOT_TERMINAL', 'CONFLICT', acknowledge],
    ['OP-010', 400, 'CURSOR_INVALID', 'VALIDATION', list],
  ])(
    '%s %i %s becomes a DomainFailure with only its stable fields',
    async (op, status, code, category, call, extra = {}) => {
      const { world, api } = setup();
      world.addFault(op as Parameters<MockWorld['addFault']>[0], {
        kind: 'error',
        status,
        body: {
          error: { code, category, requestId: 'synthetic-req-registry', ...extra, detail: 'synthetic-raw-canary' },
        },
      });
      const failure = await call(api, world).catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(DomainFailure);
      expect(failure).toMatchObject({ code, category, requestId: 'synthetic-req-registry' });
      expect(JSON.stringify(failure)).not.toContain('synthetic-raw-canary');
    },
  );

  test('an authenticated rejection and an unknown outcome stay different failures', async () => {
    const { world, api } = setup();
    world.addFault('OP-006', mockErrors.maintenance);
    await expect(prepare(api, world)).rejects.toBeInstanceOf(DomainFailure);
    world.addFault('OP-006', { kind: 'network' });
    await expect(prepare(api, world)).rejects.toBeInstanceOf(TransportFailure);
  });
});
