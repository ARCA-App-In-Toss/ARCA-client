import { delay, HttpResponse, http } from 'msw';
import { MOCK_API_BASE, type MockFault, type MockOp, type MockWorld } from './world.ts';

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
  }
}

function bearerOf(request: Request): string | null {
  const header = request.headers.get('Authorization');
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
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
          consentPolicies: [],
        },
        { status: 201, headers: noStore },
      );
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
      const { dateKst } = world.today;
      return HttpResponse.json(
        {
          dateKst,
          sema: {
            dailySemaId: 'synthetic-day',
            semaId: 'synthetic-sema',
            version: '1',
            semaCode: 'SYN-001',
            dateKst,
            primaryQuestion: {
              questionId: 'synthetic-q1',
              version: '1',
              role: 'PRIMARY',
              text: '합성 기본 질문 (synthetic/non-user)',
            },
            alternateQuestion: {
              questionId: 'synthetic-q2',
              version: '1',
              role: 'ALTERNATE',
              text: '합성 대체 질문 (synthetic/non-user)',
            },
          },
          answer: { state: 'UNANSWERED' },
          activeAnswerCount: { state: 'AVAILABLE', value: { count: 0, observedAt: '2026-09-27T00:00:00Z' } },
        },
        { headers: noStore },
      );
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
