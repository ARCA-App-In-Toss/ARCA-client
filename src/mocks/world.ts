// Synthetic/non-user mock server state (07 §2, §3). Only server state is shared between devices;
// session tokens here are opaque synthetic strings.

export const MOCK_API_BASE = 'https://arca.mock.invalid';

export const SYNTHETIC_KEYS = {
  registered: 'synthetic-anon-key-registered',
  unregistered: 'synthetic-anon-key-unregistered',
} as const;

export type MockOp = 'OP-001' | 'OP-005' | 'OP-006' | 'OP-007' | 'OP-008' | 'OP-009' | 'OP-010' | 'OP-011';

/** One scripted fault, consumed once per matching request (07 §6). */
export type MockFault =
  | { kind: 'network' }
  | { kind: 'error'; status: number; body: unknown }
  | { kind: 'malformed' }
  | { kind: 'delay'; ms: number }
  /** Hold the response until the test releases it, then optionally apply another fault. */
  | { kind: 'hold'; release: Promise<void>; after?: MockFault }
  /** The server applies the request's effect, then the response is lost in transit (07 §6). */
  | { kind: 'lose-response' };

export interface MockTicket {
  owner: string;
  ticketId: string;
  operationId: string;
  fingerprint: string;
  dailySemaId: string;
  question: MockQuestion;
  state: 'PREPARED' | 'EXECUTING' | 'SUCCEEDED' | 'NOT_APPLIED';
  contentDigest: string | null;
  pendingContent: string | null;
  answerId: string | null;
  error: { code: string; category: string } | null;
  completedAt: string | null;
  acknowledged: boolean;
}

interface Passenger {
  passengerCode: string;
  nickname: string | null;
  revision: string;
  dataGeneration: string;
}

interface SessionRecord {
  anonymousKey: string;
  revoked: boolean;
}

export interface MockQuestion {
  questionId: string;
  version: string;
  role: 'PRIMARY' | 'ALTERNATE';
  text: string;
}

export interface MockSema {
  dailySemaId: string;
  semaId: string;
  version: string;
  semaCode: string;
  dateKst: string;
  primaryQuestion: MockQuestion;
  alternateQuestion: MockQuestion;
}

export interface MockAnswer {
  owner: string;
  answerId: string;
  revision: string;
  dailySemaId: string;
  semaId: string;
  semaVersion: string;
  semaCode: string;
  createdAt: string;
  updatedAt: string;
  createdDateKst: string;
  isEdited: boolean;
  question: MockQuestion;
  content: string;
}

export type ExcerptProfile = 'COMPACT' | 'STANDARD' | 'EXPANDED';

/** Server-side excerpt budgets (04 §5.10 current defaults); the FE reads `limits`, never these. */
export const EXCERPT_LIMITS: Record<ExcerptProfile, { maxGraphemes: number; maxLogicalLines: number }> = {
  COMPACT: { maxGraphemes: 96, maxLogicalLines: 4 },
  STANDARD: { maxGraphemes: 120, maxLogicalLines: 4 },
  EXPANDED: { maxGraphemes: 160, maxLogicalLines: 6 },
};

/** Longest prefix within the EGC and logical-line budgets; no trim or normalization (04 §5.10). */
export function excerptOf(content: string, profile: ExcerptProfile) {
  const limits = EXCERPT_LIMITS[profile];
  const segments = [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(content)].map((s) => s.segment);
  let text = '';
  let lines = 1;
  let count = 0;
  for (const segment of segments) {
    const isBreak = segment === '\n' || segment === '\r\n' || segment === '\r';
    if (isBreak && lines + 1 > limits.maxLogicalLines) break;
    if (count + 1 > limits.maxGraphemes) break;
    text += segment;
    count += 1;
    if (isBreak) lines += 1;
  }
  return { profile, limits, text, isTruncated: text.length < content.length };
}

export const SYNTHETIC_SEMA: MockSema = {
  dailySemaId: 'synthetic-day',
  semaId: 'synthetic-sema',
  version: '1',
  semaCode: 'SYN-001',
  dateKst: '2026-09-27',
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
};

export interface MockWorld {
  passengers: Map<string, Passenger>;
  sessions: Map<string, SessionRecord>;
  sema: MockSema;
  answers: Map<string, MockAnswer>;
  tickets: Map<string, MockTicket>;
  /** When true, OP-007 answers 202 EXECUTING and the effect waits for `completeExecuting`. */
  asyncExecution: boolean;
  /** When true, SUCCEEDED results carry presentation UNAVAILABLE (retryable). */
  presentationUnavailable: boolean;
  /** Applies pending EXECUTING effects, as a server worker would. */
  completeExecuting(): void;
  faults: Map<MockOp, MockFault[]>;
  requests: { op: MockOp; bearer: string | null }[];
  issueToken(anonymousKey: string): string;
  /** Revoke every token for the key, as a server-side session expiry would. */
  revokeSessions(anonymousKey: string): void;
  takeFault(op: MockOp): MockFault | undefined;
  addFault(op: MockOp, ...faults: MockFault[]): void;
  answersOf(owner: string): MockAnswer[];
  /** Adds a stored answer directly (fixture setup, not an API path). */
  seedAnswer(owner: string, content: string, overrides?: Partial<MockAnswer>): MockAnswer;
}

export type ServerBase = 'server.prePassenger' | 'server.activeUnanswered' | 'server.activeAnswered';

export const SYNTHETIC_ANSWER_TEXT = '합성 응답입니다.\n두 번째 줄 (synthetic/non-user)';

export function createMockWorld(base: ServerBase): MockWorld {
  const passengers = new Map<string, Passenger>();
  if (base !== 'server.prePassenger') {
    passengers.set(SYNTHETIC_KEYS.registered, {
      passengerCode: 'SYN-0001',
      nickname: null,
      revision: 'p-r1',
      dataGeneration: 'gen-synthetic-1',
    });
  }
  const sessions = new Map<string, SessionRecord>();
  const faults = new Map<MockOp, MockFault[]>();
  const answers = new Map<string, MockAnswer>();
  const tickets = new Map<string, MockTicket>();
  let tokenSeq = 0;
  let answerSeq = 0;

  const world: MockWorld = {
    passengers,
    sessions,
    sema: SYNTHETIC_SEMA,
    answers,
    tickets,
    asyncExecution: false,
    presentationUnavailable: false,
    completeExecuting() {
      for (const ticket of tickets.values()) {
        if (ticket.state !== 'EXECUTING' || ticket.pendingContent === null) continue;
        const answer = world.seedAnswer(ticket.owner, ticket.pendingContent, {
          dailySemaId: ticket.dailySemaId,
          question: ticket.question,
          createdAt: '2026-09-27T02:00:00Z',
          updatedAt: '2026-09-27T02:00:00Z',
        });
        ticket.state = 'SUCCEEDED';
        ticket.answerId = answer.answerId;
        ticket.completedAt = '2026-09-27T02:00:00Z';
        ticket.pendingContent = null;
      }
    },
    faults,
    requests: [],
    issueToken(anonymousKey) {
      tokenSeq += 1;
      const token = `synthetic-token-${tokenSeq}`;
      sessions.set(token, { anonymousKey, revoked: false });
      return token;
    },
    revokeSessions(anonymousKey) {
      for (const record of sessions.values()) if (record.anonymousKey === anonymousKey) record.revoked = true;
    },
    takeFault(op) {
      return faults.get(op)?.shift();
    },
    addFault(op, ...added) {
      faults.set(op, [...(faults.get(op) ?? []), ...added]);
    },
    answersOf(owner) {
      return [...answers.values()].filter((a) => a.owner === owner);
    },
    seedAnswer(owner, content, overrides = {}) {
      answerSeq += 1;
      const sema = world.sema;
      const answer: MockAnswer = {
        owner,
        answerId: `synthetic-answer-${answerSeq}`,
        revision: 'a-r1',
        dailySemaId: sema.dailySemaId,
        semaId: sema.semaId,
        semaVersion: sema.version,
        semaCode: sema.semaCode,
        createdAt: '2026-09-27T01:00:00Z',
        updatedAt: '2026-09-27T01:00:00Z',
        createdDateKst: sema.dateKst,
        isEdited: false,
        question: sema.primaryQuestion,
        content,
        ...overrides,
      };
      answers.set(answer.answerId, answer);
      return answer;
    },
  };
  if (base === 'server.activeAnswered') world.seedAnswer(SYNTHETIC_KEYS.registered, SYNTHETIC_ANSWER_TEXT);
  return world;
}
