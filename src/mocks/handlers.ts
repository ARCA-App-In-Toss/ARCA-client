import { delay, HttpResponse, http } from 'msw';
import {
  type ExcerptProfile,
  excerptOf,
  MOCK_API_BASE,
  type MockAnswer,
  type MockFault,
  type MockOp,
  type MockPolicy,
  type MockTicket,
  type MockWorld,
  type Passenger,
} from './world.ts';

const noStore = { 'Cache-Control': 'no-store' };

function errorBody(code: string, category: string, extra: Record<string, unknown> = {}) {
  return { error: { code, category, requestId: `synthetic-req-${code.toLowerCase()}`, ...extra } };
}

async function applyFault(world: MockWorld, op: MockOp): Promise<Response | undefined> {
  const fault = world.takeFault(op);
  return fault ? respondWith(fault, op) : undefined;
}

async function respondWith(fault: MockFault, op: MockOp): Promise<Response | undefined> {
  switch (fault.kind) {
    case 'network':
      return HttpResponse.error();
    case 'error':
      return HttpResponse.json(fault.body as Record<string, unknown>, { status: fault.status, headers: noStore });
    case 'malformed':
      return HttpResponse.json({ unexpected: true }, { status: op === 'OP-001' ? 201 : 200, headers: noStore });
    case 'delay':
      await delay(fault.ms);
      return undefined;
    case 'hold':
      await fault.release;
      return fault.after ? respondWith(fault.after, op) : undefined;
    case 'lose-response':
      return HttpResponse.error();
  }
}

/** ExcerptAnswer wire shape (answer core + excerpt of the stored content). */
export function excerptAnswer(answer: MockAnswer, profile: ExcerptProfile) {
  const { owner: _owner, content, ...core } = answer;
  const excerpt = excerptOf(content, profile);
  return {
    ...core,
    excerpt: { state: 'AVAILABLE', value: { ...excerpt, sourceRevision: answer.revision } },
  };
}

const TICKET_TIMES = {
  acceptedAt: '2026-09-27T01:59:00Z',
  executeBy: '2026-09-27T14:59:59Z',
  resultExpiresAt: '2026-10-04T02:00:00Z',
};

/** AnswerWrite CommandResult wire shape for the ticket's current state (05 §5.5). */
function ticketDto(world: MockWorld, ticket: MockTicket, profile: ExcerptProfile) {
  const base = {
    ticketId: ticket.ticketId,
    operationId: ticket.operationId,
    kind: 'ANSWER_WRITE',
    target: { mode: 'CREATE', dailySemaId: ticket.dailySemaId },
    acceptedAt: TICKET_TIMES.acceptedAt,
    acceptedDateKst: world.sema.dateKst,
    executeBy: TICKET_TIMES.executeBy,
    state: ticket.state,
  };
  if (ticket.state === 'PREPARED' || ticket.state === 'EXECUTING') return base;
  const settled = { ...base, completedAt: ticket.completedAt, resultExpiresAt: TICKET_TIMES.resultExpiresAt };
  if (ticket.state === 'NOT_APPLIED') return { ...settled, error: ticket.error };
  const answer = ticket.answerId ? world.answers.get(ticket.answerId) : undefined;
  const presentation = ticket.acknowledged
    ? { state: 'ACKNOWLEDGED' }
    : world.presentationUnavailable
      ? { state: 'UNAVAILABLE', retryable: true }
      : !answer
        ? { state: 'RESOURCE_CHANGED' }
        : {
            state: 'AVAILABLE',
            value: {
              question: answer.question,
              excerpt: {
                state: 'AVAILABLE',
                value: { ...excerptOf(answer.content, profile), sourceRevision: answer.revision },
              },
              activeAnswerCount: {
                state: 'AVAILABLE',
                value: { count: world.answersOf(ticket.owner).length, observedAt: '2026-09-27T02:00:01Z' },
              },
            },
          };
  return {
    ...settled,
    proof: {
      answerId: ticket.answerId,
      revision: answer?.revision ?? 'a-r1',
      mode: 'CREATED',
      acceptedDateKst: world.sema.dateKst,
    },
    presentation,
  };
}

const graphemeCount = (text: string) => [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text)].length;

function bearerOf(request: Request): string | null {
  const header = request.headers.get('Authorization');
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}

/** Owner key for a valid ACTIVE bearer, or the error response to return. */
function activeOwner(world: MockWorld, bearer: string | null): string | Response {
  const session = bearer ? world.sessions.get(bearer) : undefined;
  if (!session) return HttpResponse.json(errorBody('SESSION_INVALID', 'AUTH'), { status: 401, headers: noStore });
  if (session.revoked) {
    return HttpResponse.json(
      errorBody('SESSION_RECOVERY_REQUIRED', 'AUTH', {
        recovery: { kind: 'REESTABLISH_SESSION', recoveryAllowed: true },
      }),
      { status: 401, headers: noStore },
    );
  }
  if (!world.passengers.has(session.anonymousKey)) {
    return HttpResponse.json(errorBody('SESSION_SCOPE_INSUFFICIENT', 'AUTH'), { status: 403, headers: noStore });
  }
  return session.anonymousKey;
}

export function createHandlers(world: MockWorld, baseUrl = MOCK_API_BASE) {
  return [
    http.post(`${baseUrl}/v1/sessions`, async ({ request }) => {
      world.requests.push({ op: 'OP-001', bearer: null });
      const faulted = await applyFault(world, 'OP-001');
      if (faulted) return faulted;

      const body = (await request.json()) as { anonymousKey?: unknown };
      if (typeof body.anonymousKey !== 'string' || body.anonymousKey.length === 0) {
        return HttpResponse.json(errorBody('INVALID_REQUEST', 'VALIDATION'), { status: 400, headers: noStore });
      }
      const passenger = world.passengers.get(body.anonymousKey);
      const token = world.issueToken(body.anonymousKey);
      return HttpResponse.json(
        {
          accessToken: token,
          expiresAt: '2026-09-27T15:00:00Z',
          context: passenger
            ? {
                mode: 'ACTIVE',
                passenger: {
                  passengerCode: passenger.passengerCode,
                  nickname: passenger.nickname,
                  revision: passenger.revision,
                },
                dataGeneration: passenger.dataGeneration,
              }
            : { mode: 'PRE_PASSENGER', passenger: null },
          consentPolicies: world.policies,
        },
        { status: 201, headers: noStore },
      );
    }),

    http.get(`${baseUrl}/v1/passenger`, async ({ request }) => {
      const bearer = bearerOf(request);
      world.requests.push({ op: 'OP-002', bearer });
      const faulted = await applyFault(world, 'OP-002');
      if (faulted) return faulted;
      const owner = activeOwner(world, bearer);
      if (owner instanceof Response) return owner;
      const { passengerCode, nickname, revision } = world.passengers.get(owner) as Passenger;
      return HttpResponse.json({ passengerCode, nickname, revision }, { headers: noStore });
    }),

    // OP-004 (05 §6.2): fingerprint before revision; receipts are replayed until they expire.
    http.put(`${baseUrl}/v1/passenger/nickname`, async ({ request }) => {
      const bearer = bearerOf(request);
      world.requests.push({ op: 'OP-004', bearer });
      const fault = world.takeFault('OP-004');
      if (fault && fault.kind !== 'lose-response') {
        const response = await respondWith(fault, 'OP-004');
        if (response) return response;
      }
      const owner = activeOwner(world, bearer);
      if (owner instanceof Response) return owner;
      const operationId = request.headers.get('Idempotency-Key') ?? '';
      const body = (await request.json()) as { nickname: string | null; expectedRevision: string };
      const fingerprint = JSON.stringify([body.nickname, body.expectedRevision]);
      const passenger = world.passengers.get(owner) as Passenger;

      let receipt = world.nicknameReceipts.find((r) => r.anonymousKey === owner && r.operationId === operationId);
      if (receipt?.expired) {
        return HttpResponse.json(errorBody('OPERATION_RESULT_EXPIRED', 'CONFLICT'), { status: 409, headers: noStore });
      }
      if (receipt && receipt.fingerprint !== fingerprint) {
        return HttpResponse.json(errorBody('IDEMPOTENCY_KEY_REUSED', 'CONFLICT'), { status: 409, headers: noStore });
      }
      if (!receipt) {
        const value = body.nickname === null ? null : body.nickname.trim();
        const count = value === null ? 0 : graphemeCount(value);
        if (value !== null && (count < 2 || count > 12 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value))) {
          return HttpResponse.json(errorBody('NICKNAME_INVALID', 'VALIDATION'), { status: 422, headers: noStore });
        }
        if (body.expectedRevision !== passenger.revision) {
          return HttpResponse.json(errorBody('REVISION_CONFLICT', 'CONFLICT'), { status: 409, headers: noStore });
        }
        passenger.nickname = value;
        passenger.revision = `p-r${world.nicknameReceipts.length + 2}`;
        receipt = {
          anonymousKey: owner,
          operationId,
          fingerprint,
          profile: { passengerCode: passenger.passengerCode, nickname: value, revision: passenger.revision },
          expired: false,
        };
        world.nicknameReceipts.push(receipt);
      }
      const response = HttpResponse.json(
        { operationId, profile: receipt.profile, resultExpiresAt: '2026-10-04T02:00:00Z' },
        { headers: noStore },
      );
      return fault?.kind === 'lose-response' ? HttpResponse.error() : response;
    }),

    // OP-003 (05 §6.2): consents and passenger are created together; the PRE token is revoked.
    http.post(`${baseUrl}/v1/passenger`, async ({ request }) => {
      const bearer = bearerOf(request);
      world.requests.push({ op: 'OP-003', bearer });
      const fault = world.takeFault('OP-003');
      if (fault && fault.kind !== 'lose-response') {
        const response = await respondWith(fault, 'OP-003');
        if (response) return response;
      }
      const session = bearer ? world.sessions.get(bearer) : undefined;
      if (!session) return HttpResponse.json(errorBody('SESSION_INVALID', 'AUTH'), { status: 401, headers: noStore });
      if (session.revoked) {
        return HttpResponse.json(
          errorBody('SESSION_RECOVERY_REQUIRED', 'AUTH', {
            recovery: { kind: 'REESTABLISH_SESSION', recoveryAllowed: true },
          }),
          { status: 401, headers: noStore },
        );
      }
      const key = session.anonymousKey;
      const operationId = request.headers.get('Idempotency-Key') ?? '';
      const body = (await request.json()) as { consents: { policyId: string; version: string }[] };
      const fingerprint = JSON.stringify(
        [...body.consents].sort((a, b) => a.policyId.localeCompare(b.policyId)).map((c) => [c.policyId, c.version]),
      );

      // Fingerprint check comes before current-policy validation (05 §6.2).
      const replay = world.creations.find((c) => c.anonymousKey === key && c.operationId === operationId);
      let status = 200;
      if (replay) {
        if (replay.fingerprint !== fingerprint) {
          return HttpResponse.json(errorBody('IDEMPOTENCY_KEY_REUSED', 'CONFLICT'), { status: 409, headers: noStore });
        }
      } else {
        if (world.passengers.has(key)) {
          return HttpResponse.json(errorBody('PASSENGER_ALREADY_EXISTS', 'CONFLICT'), {
            status: 409,
            headers: noStore,
          });
        }
        const required = world.policies.filter((p) => p.required);
        const agreed = (p: MockPolicy) => body.consents.some((c) => c.policyId === p.policyId);
        if (required.some((p) => !agreed(p))) {
          return HttpResponse.json(errorBody('CONSENT_REQUIRED', 'VALIDATION'), { status: 422, headers: noStore });
        }
        if (required.some((p) => !body.consents.some((c) => c.policyId === p.policyId && c.version === p.version))) {
          return HttpResponse.json(
            errorBody('POLICY_VERSION_CHANGED', 'VALIDATION', {
              recovery: { kind: 'REFRESH_POLICIES', policies: world.policies },
            }),
            { status: 422, headers: noStore },
          );
        }
        world.passengers.set(key, {
          passengerCode: `SYN-${String(world.creations.length + 1001)}`,
          nickname: null,
          revision: 'p-r1',
          dataGeneration: `gen-synthetic-created-${world.creations.length + 1}`,
        });
        world.creations.push({ anonymousKey: key, operationId, fingerprint });
        world.revokeSessions(key);
        status = 201;
      }
      const passenger = world.passengers.get(key) as Passenger;
      const response = HttpResponse.json(
        {
          accessToken: world.issueToken(key),
          expiresAt: '2026-09-27T15:00:00Z',
          context: {
            mode: 'ACTIVE',
            passenger: {
              passengerCode: passenger.passengerCode,
              nickname: passenger.nickname,
              revision: passenger.revision,
            },
            dataGeneration: passenger.dataGeneration,
          },
          consentPolicies: world.policies,
        },
        { status, headers: noStore },
      );
      return fault?.kind === 'lose-response' ? HttpResponse.error() : response;
    }),

    http.get(`${baseUrl}/v1/today`, async ({ request }) => {
      const bearer = bearerOf(request);
      world.requests.push({ op: 'OP-005', bearer });
      const faulted = await applyFault(world, 'OP-005');
      if (faulted) return faulted;

      const session = bearer ? world.sessions.get(bearer) : undefined;
      if (!session) return HttpResponse.json(errorBody('SESSION_INVALID', 'AUTH'), { status: 401, headers: noStore });
      if (session.revoked) {
        return HttpResponse.json(
          errorBody('SESSION_RECOVERY_REQUIRED', 'AUTH', {
            recovery: { kind: 'REESTABLISH_SESSION', recoveryAllowed: true },
          }),
          { status: 401, headers: noStore },
        );
      }
      if (!world.passengers.has(session.anonymousKey)) {
        return HttpResponse.json(errorBody('SESSION_SCOPE_INSUFFICIENT', 'AUTH'), { status: 403, headers: noStore });
      }
      const owner = session.anonymousKey;
      const url = new URL(request.url);
      const profile = (url.searchParams.get('excerptProfile') ?? 'EXPANDED') as ExcerptProfile;
      const today = world.answersOf(owner).find((a) => a.dailySemaId === world.sema.dailySemaId);
      return HttpResponse.json(
        {
          dateKst: world.sema.dateKst,
          sema: world.sema,
          answer: today ? { state: 'ANSWERED', value: excerptAnswer(today, profile) } : { state: 'UNANSWERED' },
          activeAnswerCount: {
            state: 'AVAILABLE',
            value: { count: world.answersOf(owner).length, observedAt: '2026-09-27T00:00:00Z' },
          },
        },
        { headers: noStore },
      );
    }),

    http.post(`${baseUrl}/v1/answer-write-commands`, async ({ request }) => {
      const bearer = bearerOf(request);
      world.requests.push({ op: 'OP-006', bearer });
      const fault = world.takeFault('OP-006');
      if (fault && fault.kind !== 'lose-response') {
        const faulted = await respondWith(fault, 'OP-006');
        if (faulted) return faulted;
      }
      const owner = activeOwner(world, bearer);
      if (owner instanceof Response) return owner;

      const operationId = request.headers.get('Idempotency-Key') ?? '';
      const body = (await request.json()) as Record<string, unknown>;
      const fingerprint = JSON.stringify(body);
      const existing = [...world.tickets.values()].find((t) => t.owner === owner && t.operationId === operationId);
      let response: Response;
      if (existing) {
        response =
          existing.fingerprint === fingerprint
            ? HttpResponse.json(ticketDto(world, existing, 'COMPACT'), { status: 200, headers: noStore })
            : HttpResponse.json(errorBody('IDEMPOTENCY_KEY_REUSED', 'CONFLICT'), { status: 409, headers: noStore });
      } else if (body.dailySemaId !== world.sema.dailySemaId || body.semaId !== world.sema.semaId) {
        response = HttpResponse.json(
          errorBody('SEMA_REPLACED', 'VALIDATION', { recovery: { kind: 'REFRESH_TODAY' } }),
          {
            status: 422,
            headers: noStore,
          },
        );
      } else if (world.answersOf(owner).some((a) => a.dailySemaId === body.dailySemaId)) {
        response = HttpResponse.json(errorBody('ANSWER_ALREADY_EXISTS', 'CONFLICT'), { status: 409, headers: noStore });
      } else {
        const question =
          body.questionId === world.sema.alternateQuestion.questionId
            ? world.sema.alternateQuestion
            : world.sema.primaryQuestion;
        const ticket: MockTicket = {
          owner,
          ticketId: `synthetic-ticket-${world.tickets.size + 1}`,
          operationId,
          fingerprint,
          dailySemaId: String(body.dailySemaId),
          question,
          state: 'PREPARED',
          contentDigest: null,
          pendingContent: null,
          answerId: null,
          error: null,
          completedAt: null,
          acknowledged: false,
        };
        world.tickets.set(ticket.ticketId, ticket);
        response = HttpResponse.json(ticketDto(world, ticket, 'COMPACT'), { status: 201, headers: noStore });
      }
      return fault?.kind === 'lose-response' ? HttpResponse.error() : response;
    }),

    http.put(`${baseUrl}/v1/commands/:ticketId/execution`, async ({ request, params }) => {
      const bearer = bearerOf(request);
      world.requests.push({ op: 'OP-007', bearer });
      const fault = world.takeFault('OP-007');
      if (fault && fault.kind !== 'lose-response') {
        const faulted = await respondWith(fault, 'OP-007');
        if (faulted) return faulted;
      }
      const owner = activeOwner(world, bearer);
      if (owner instanceof Response) return owner;
      const ticket = world.tickets.get(String(params.ticketId));
      if (!ticket || ticket.owner !== owner) {
        return HttpResponse.json(errorBody('COMMAND_NOT_FOUND', 'VALIDATION'), { status: 404, headers: noStore });
      }
      const body = (await request.json()) as { kind?: unknown; content?: unknown };
      if (body.kind !== 'ANSWER_WRITE' || typeof body.content !== 'string') {
        return HttpResponse.json(errorBody('INVALID_REQUEST', 'VALIDATION'), { status: 400, headers: noStore });
      }
      const digest = `d:${body.content}`;
      if (ticket.contentDigest !== null && ticket.contentDigest !== digest) {
        return HttpResponse.json(errorBody('COMMAND_PAYLOAD_MISMATCH', 'VALIDATION'), {
          status: 422,
          headers: noStore,
        });
      }
      if (ticket.state === 'PREPARED') {
        ticket.contentDigest = digest;
        const count = graphemeCount(body.content);
        if (count < 1 || count > 2_000) {
          ticket.state = 'NOT_APPLIED';
          ticket.error = { code: 'ANSWER_CONTENT_INVALID', category: 'VALIDATION' };
          ticket.completedAt = '2026-09-27T02:00:00Z';
        } else if (world.asyncExecution) {
          ticket.state = 'EXECUTING';
          ticket.pendingContent = body.content;
        } else {
          ticket.state = 'EXECUTING';
          ticket.pendingContent = body.content;
          world.completeExecuting();
        }
      }
      const status = ticket.state === 'EXECUTING' ? 202 : 200;
      const response = HttpResponse.json(ticketDto(world, ticket, 'COMPACT'), { status, headers: noStore });
      return fault?.kind === 'lose-response' ? HttpResponse.error() : response;
    }),

    http.get(`${baseUrl}/v1/commands/:ticketId`, async ({ request, params }) => {
      const bearer = bearerOf(request);
      world.requests.push({ op: 'OP-008', bearer });
      const faulted = await applyFault(world, 'OP-008');
      if (faulted) return faulted;
      const owner = activeOwner(world, bearer);
      if (owner instanceof Response) return owner;
      const ticket = world.tickets.get(String(params.ticketId));
      if (!ticket || ticket.owner !== owner) {
        return HttpResponse.json(errorBody('COMMAND_NOT_FOUND', 'VALIDATION'), { status: 404, headers: noStore });
      }
      const profile = (new URL(request.url).searchParams.get('excerptProfile') ?? 'COMPACT') as ExcerptProfile;
      return HttpResponse.json(ticketDto(world, ticket, profile), { headers: noStore });
    }),

    http.put(`${baseUrl}/v1/commands/:ticketId/acknowledgement`, async ({ request, params }) => {
      const bearer = bearerOf(request);
      world.requests.push({ op: 'OP-009', bearer });
      const faulted = await applyFault(world, 'OP-009');
      if (faulted) return faulted;
      const owner = activeOwner(world, bearer);
      if (owner instanceof Response) return owner;
      const ticket = world.tickets.get(String(params.ticketId));
      if (!ticket || ticket.owner !== owner) {
        return HttpResponse.json(errorBody('COMMAND_NOT_FOUND', 'VALIDATION'), { status: 404, headers: noStore });
      }
      if (ticket.state !== 'SUCCEEDED' && ticket.state !== 'NOT_APPLIED') {
        return HttpResponse.json(errorBody('COMMAND_NOT_TERMINAL', 'CONFLICT'), { status: 409, headers: noStore });
      }
      ticket.acknowledged = true;
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(`${baseUrl}/v1/answers`, async ({ request }) => {
      const bearer = bearerOf(request);
      world.requests.push({ op: 'OP-010', bearer });
      const faulted = await applyFault(world, 'OP-010');
      if (faulted) return faulted;
      const owner = activeOwner(world, bearer);
      if (owner instanceof Response) return owner;
      const url = new URL(request.url);
      const profile = (url.searchParams.get('excerptProfile') ?? 'STANDARD') as ExcerptProfile;
      const cursor = url.searchParams.get('cursor');
      // Mock-only opaque cursor: newest first by createdAt, then answerId (05 OP-010).
      const offset = cursor ? Number.parseInt(atob(cursor).replace('mock-offset:', ''), 10) : 0;
      if (Number.isNaN(offset)) {
        return HttpResponse.json(errorBody('CURSOR_INVALID', 'VALIDATION'), { status: 400, headers: noStore });
      }
      const sorted = world
        .answersOf(owner)
        .sort((a, b) =>
          a.createdAt === b.createdAt ? (a.answerId < b.answerId ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
        );
      const page = sorted.slice(offset, offset + 20);
      const next = offset + 20 < sorted.length ? btoa(`mock-offset:${offset + 20}`) : null;
      return HttpResponse.json(
        { items: page.map((a) => excerptAnswer(a, profile)), nextCursor: next, pageSnapshotAt: '2026-09-27T02:00:02Z' },
        { headers: noStore },
      );
    }),

    http.get(`${baseUrl}/v1/answers/:answerId`, async ({ request, params }) => {
      const bearer = bearerOf(request);
      world.requests.push({ op: 'OP-011', bearer });
      const faulted = await applyFault(world, 'OP-011');
      if (faulted) return faulted;
      const session = bearer ? world.sessions.get(bearer) : undefined;
      if (!session || session.revoked) {
        return HttpResponse.json(errorBody('SESSION_INVALID', 'AUTH'), { status: 401, headers: noStore });
      }
      const answer = world.answers.get(String(params.answerId));
      // Missing, deleted and not-owned are one result (05 OP-011).
      if (!answer || answer.owner !== session.anonymousKey) {
        return HttpResponse.json(errorBody('ANSWER_NOT_FOUND', 'VALIDATION'), { status: 404, headers: noStore });
      }
      const { owner: _owner, ...detail } = answer;
      return HttpResponse.json(detail, { headers: noStore });
    }),
  ];
}

export const mockErrors = {
  maintenance: { kind: 'error', status: 503, body: errorBody('MAINTENANCE', 'MAINTENANCE') },
  anonymousKeyInvalid: { kind: 'error', status: 401, body: errorBody('ANONYMOUS_KEY_INVALID', 'AUTH') },
  sessionRecoveryRequired: {
    kind: 'error',
    status: 401,
    body: errorBody('SESSION_RECOVERY_REQUIRED', 'AUTH', {
      recovery: { kind: 'REESTABLISH_SESSION', recoveryAllowed: true },
    }),
  },
  /** Error envelope carrying an extra field the FE must drop (05 §7.6). */
  internalWithExtra: {
    kind: 'error',
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', category: 'MAINTENANCE', requestId: 'synthetic-req-x', stack: 'leak' } },
  },
} as const;
