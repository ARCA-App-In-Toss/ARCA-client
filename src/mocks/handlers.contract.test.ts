import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import {
  zAllDataDeleteClosedOutcomeUnavailableReconciled,
  zAnswerWritePrepared,
  zApiErrorEnvelope,
} from '../data/api/generated/zod.gen.ts';
import { createHandlers } from './handlers.ts';
import { createMockWorld, MOCK_API_BASE, type MockWorld, SYNTHETIC_KEYS } from './world.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const opId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function setup(base: Parameters<typeof createMockWorld>[0] = 'server.activeUnanswered') {
  const world = createMockWorld(base);
  server.use(...createHandlers(world));
  return world;
}

async function call(method: string, path: string, bearer: string, body?: unknown, operationId?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${bearer}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (operationId) headers['Idempotency-Key'] = operationId;
  const response = await fetch(`${MOCK_API_BASE}/v1${path}`, {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

function errorCode(body: unknown) {
  const parsed = zApiErrorEnvelope.safeParse(body);
  expect(parsed.success).toBe(true);
  return parsed.success ? parsed.data.error.code : undefined;
}

function createInput(world: MockWorld) {
  return {
    mode: 'CREATE',
    dailySemaId: world.sema.dailySemaId,
    semaId: world.sema.semaId,
    semaVersion: world.sema.version,
    questionId: world.sema.primaryQuestion.questionId,
    questionVersion: world.sema.primaryQuestion.version,
  };
}

async function prepareWrite(world: MockWorld, bearer: string, operationId: string) {
  const prepared = await call('POST', '/answer-write-commands', bearer, createInput(world), operationId);
  return zAnswerWritePrepared.parse(prepared.body).ticketId;
}

async function prepareDeletion(bearer: string) {
  const prepared = await call('POST', '/data-deletion-commands', bearer, {}, opId(2));
  return (prepared.body as { ticketId: string }).ticketId;
}

function deletionRecoveryBearer(world: MockWorld, ticketId: string) {
  const token = world.issueToken(SYNTHETIC_KEYS.registered);
  const record = world.sessions.get(token);
  if (record) record.deletionTicketId = ticketId;
  return token;
}

describe('OP-007 executeCommand kind mismatch', () => {
  test('API-V-008 valid kind for another ticket kind is 422 COMMAND_PAYLOAD_MISMATCH and ticket stays PREPARED', async () => {
    const world = setup();
    const bearer = world.issueToken(SYNTHETIC_KEYS.registered);
    const ticketId = await prepareWrite(world, bearer, opId(1));

    const mismatch = await call('PUT', `/commands/${ticketId}/execution`, bearer, { kind: 'ANSWER_DELETE' });
    expect(mismatch.status).toBe(422);
    expect(errorCode(mismatch.body)).toBe('COMMAND_PAYLOAD_MISMATCH');
    expect(world.tickets.get(ticketId)?.state).toBe('PREPARED');

    const malformed = await call('PUT', `/commands/${ticketId}/execution`, bearer, { kind: 'ANSWER_WRITE' });
    expect(malformed.status).toBe(400);
    expect(errorCode(malformed.body)).toBe('INVALID_REQUEST');
  });

  test('API-V-008 answer kind sent to an all-data deletion ticket is 422 and does not execute', async () => {
    const world = setup();
    const bearer = world.issueToken(SYNTHETIC_KEYS.registered);
    const ticketId = await prepareDeletion(bearer);

    const mismatch = await call('PUT', `/commands/${ticketId}/execution`, bearer, { kind: 'ANSWER_DELETE' });
    expect(mismatch.status).toBe(422);
    expect(errorCode(mismatch.body)).toBe('COMMAND_PAYLOAD_MISMATCH');
    expect(world.deletions.get(ticketId)?.state).toBe('PREPARED');

    const unknown = await call('PUT', `/commands/${ticketId}/execution`, bearer, { kind: 'OTHER' });
    expect(unknown.status).toBe(400);
    expect(errorCode(unknown.body)).toBe('INVALID_REQUEST');
  });
});

describe('OP-015 closeCommand expired all-data deletion', () => {
  test('MS-RESULT-001 API-V-026 sealed deletion closure carries reconciliation', async () => {
    const world = setup();
    const bearer = world.issueToken(SYNTHETIC_KEYS.registered);
    const ticketId = await prepareDeletion(bearer);
    const deletion = world.deletions.get(ticketId);
    if (deletion) {
      deletion.state = 'NOT_APPLIED';
      deletion.error = { code: 'ALL_DATA_DELETE_FAILED', category: 'MAINTENANCE' };
      deletion.resultExpired = true;
    }

    const closure = await call('PUT', `/commands/${ticketId}/closure`, bearer, {});
    expect(closure.status).toBe(200);
    const parsed = zAllDataDeleteClosedOutcomeUnavailableReconciled.safeParse(closure.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.reconciliation.nextAction).toBe('RETURN_TODAY');
  });
});

describe('OP-005 getToday deletion recovery scope', () => {
  test('API-V-014 DELETION_RECOVERY session during EXECUTING is 403 SESSION_SCOPE_INSUFFICIENT', async () => {
    const world = setup();
    world.asyncExecution = true;
    const bearer = world.issueToken(SYNTHETIC_KEYS.registered);
    const ticketId = await prepareDeletion(bearer);
    await call('PUT', `/commands/${ticketId}/execution`, bearer, { kind: 'ALL_DATA_DELETE' });
    expect(world.deletions.get(ticketId)?.state).toBe('EXECUTING');

    const today = await call('GET', '/today', deletionRecoveryBearer(world, ticketId));
    expect(today.status).toBe(403);
    expect(errorCode(today.body)).toBe('SESSION_SCOPE_INSUFFICIENT');
  });
});

describe('OP-011 getAnswer session handling', () => {
  test('MS-SES-003 API-V-002 revoked token is SESSION_RECOVERY_REQUIRED, unknown token is SESSION_INVALID', async () => {
    const world = setup('server.activeAnswered');
    const bearer = world.issueToken(SYNTHETIC_KEYS.registered);
    const [answer] = world.answersOf(SYNTHETIC_KEYS.registered);
    world.revokeSessions(SYNTHETIC_KEYS.registered);

    const revoked = await call('GET', `/answers/${answer?.answerId}`, bearer);
    expect(revoked.status).toBe(401);
    expect(errorCode(revoked.body)).toBe('SESSION_RECOVERY_REQUIRED');
    expect(revoked.body).toMatchObject({ error: { recovery: { recoveryAllowed: true } } });

    const unknown = await call('GET', `/answers/${answer?.answerId}`, 'synthetic-token-unknown');
    expect(unknown.status).toBe(401);
    expect(errorCode(unknown.body)).toBe('SESSION_INVALID');
  });

  test('API-V-014 PRE and DELETION_RECOVERY sessions are 403 SESSION_SCOPE_INSUFFICIENT', async () => {
    const pre = setup('server.prePassenger');
    const preBearer = pre.issueToken(SYNTHETIC_KEYS.unregistered);
    const preRead = await call('GET', '/answers/synthetic-answer-1', preBearer);
    expect(preRead.status).toBe(403);
    expect(errorCode(preRead.body)).toBe('SESSION_SCOPE_INSUFFICIENT');

    const world = setup('server.activeAnswered');
    const [answer] = world.answersOf(SYNTHETIC_KEYS.registered);
    const recovery = deletionRecoveryBearer(world, 'synthetic-deletion-1');
    const recoveryRead = await call('GET', `/answers/${answer?.answerId}`, recovery);
    expect(recoveryRead.status).toBe(403);
    expect(errorCode(recoveryRead.body)).toBe('SESSION_SCOPE_INSUFFICIENT');
  });
});

describe('OP-006 prepareAnswerWrite pending target', () => {
  test('API-V-014 PRE_PASSENGER passenger read is 404 PASSENGER_NOT_FOUND and creates nothing', async () => {
    const world = setup();
    const bearer = world.issueToken(SYNTHETIC_KEYS.unregistered);
    const read = await call('GET', '/passenger', bearer);
    expect(read.status).toBe(404);
    expect(errorCode(read.body)).toBe('PASSENGER_NOT_FOUND');
    expect(world.passengers.has(SYNTHETIC_KEYS.unregistered)).toBe(false);
  });

  test('API-V-020 a second CREATE for the same day with a pending ticket is 409 COMMAND_ALREADY_PENDING', async () => {
    const world = setup();
    const bearer = world.issueToken(SYNTHETIC_KEYS.registered);
    const ticketId = await prepareWrite(world, bearer, opId(3));

    const second = await call('POST', '/answer-write-commands', bearer, createInput(world), opId(4));
    expect(second.status).toBe(409);
    expect(errorCode(second.body)).toBe('COMMAND_ALREADY_PENDING');
    expect(second.body).toMatchObject({ error: { recovery: { kind: 'QUERY_COMMAND', ticketId } } });
    expect(world.tickets.size).toBe(1);

    const replay = await call('POST', '/answer-write-commands', bearer, createInput(world), opId(3));
    expect(replay.status).toBe(200);
  });

  test('API-V-020 UPDATE while a delete of the same answer is pending is 409 COMMAND_ALREADY_PENDING', async () => {
    const world = setup('server.activeAnswered');
    const bearer = world.issueToken(SYNTHETIC_KEYS.registered);
    const [answer] = world.answersOf(SYNTHETIC_KEYS.registered);
    const target = { answerId: answer?.answerId, expectedRevision: answer?.revision };
    const deleting = await call('POST', '/answer-delete-commands', bearer, target, opId(5));
    const deleteTicketId = (deleting.body as { ticketId: string }).ticketId;

    const update = await call('POST', '/answer-write-commands', bearer, { mode: 'UPDATE', ...target }, opId(6));
    expect(update.status).toBe(409);
    expect(update.body).toMatchObject({
      error: { code: 'COMMAND_ALREADY_PENDING', recovery: { kind: 'QUERY_COMMAND', ticketId: deleteTicketId } },
    });

    await call('PUT', `/commands/${deleteTicketId}/closure`, bearer, {});
    const afterClose = await call('POST', '/answer-write-commands', bearer, { mode: 'UPDATE', ...target }, opId(6));
    expect(afterClose.status).toBe(201);
  });

  test('API-V-020 delete while an update of the same answer is pending is 409 COMMAND_ALREADY_PENDING', async () => {
    const world = setup('server.activeAnswered');
    const bearer = world.issueToken(SYNTHETIC_KEYS.registered);
    const [answer] = world.answersOf(SYNTHETIC_KEYS.registered);
    const target = { answerId: answer?.answerId, expectedRevision: answer?.revision };
    const updating = await call('POST', '/answer-write-commands', bearer, { mode: 'UPDATE', ...target }, opId(7));
    const updateTicketId = (updating.body as { ticketId: string }).ticketId;

    const deleting = await call('POST', '/answer-delete-commands', bearer, target, opId(8));
    expect(deleting.status).toBe(409);
    expect(deleting.body).toMatchObject({
      error: { code: 'COMMAND_ALREADY_PENDING', recovery: { kind: 'QUERY_COMMAND', ticketId: updateTicketId } },
    });

    const resent = await call('POST', '/answer-write-commands', bearer, { mode: 'UPDATE', ...target }, opId(7));
    expect(resent.status).toBe(200);
  });
});
