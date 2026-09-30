export const MOCK_API_BASE = 'https://arca.mock.invalid';

export const SYNTHETIC_KEYS = {
  registered: 'synthetic-anon-key-registered',
  unregistered: 'synthetic-anon-key-unregistered',
} as const;

export type MockOp =
  | 'OP-001'
  | 'OP-002'
  | 'OP-003'
  | 'OP-004'
  | 'OP-005'
  | 'OP-006'
  | 'OP-007'
  | 'OP-008'
  | 'OP-009'
  | 'OP-010'
  | 'OP-011'
  | 'OP-012'
  | 'OP-013'
  | 'OP-014'
  | 'OP-015';

export type MockFault =
  | { kind: 'network' }
  | { kind: 'error'; status: number; body: unknown }
  | { kind: 'malformed' }
  | { kind: 'delay'; ms: number }
  | { kind: 'hold'; release: Promise<void>; after?: MockFault }
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
  resultExpired?: boolean;
  answerTarget?: { kind: 'UPDATE' | 'DELETE'; answerId: string; expectedRevision: string };
  deleteEffect?: 'DELETED' | 'ALREADY_ABSENT';
  proofRevision?: string;
}

export interface MockProductEvent {
  owner: string;
  eventId: string;
  name: string;
  properties: Record<string, string>;
  appVersion: string | null;
}

export interface Passenger {
  passengerCode: string;
  nickname: string | null;
  revision: string;
  dataGeneration: string;
}

export interface MockPolicy {
  policyId: string;
  version: string;
  title: string;
  url: string;
  required: boolean;
}

export const SYNTHETIC_POLICIES: readonly MockPolicy[] = [
  {
    policyId: 'terms-of-service',
    version: 'synthetic-v1',
    title: '서비스 이용약관',
    url: 'https://arca.mock.invalid/policies/terms',
    required: true,
  },
  {
    policyId: 'privacy-policy',
    version: 'synthetic-v1',
    title: '개인정보처리방침',
    url: 'https://arca.mock.invalid/policies/privacy',
    required: true,
  },
];

export interface MockCreation {
  anonymousKey: string;
  operationId: string;
  fingerprint: string;
}

export interface MockNicknameReceipt {
  anonymousKey: string;
  operationId: string;
  fingerprint: string;
  profile: { passengerCode: string; nickname: string | null; revision: string };
  expired: boolean;
}

interface SessionRecord {
  anonymousKey: string;
  revoked: boolean;
  deletionTicketId?: string;
}

export interface MockDeletion {
  owner: string;
  ticketId: string;
  operationId: string;
  generation: string;
  state: 'PREPARED' | 'EXECUTING' | 'SUCCEEDED' | 'NOT_APPLIED';
  error: { code: string; category: string } | null;
  acknowledged: boolean;
  resultExpired?: boolean;
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

export const EXCERPT_LIMITS: Record<ExcerptProfile, { maxGraphemes: number; maxLogicalLines: number }> = {
  COMPACT: { maxGraphemes: 96, maxLogicalLines: 4 },
  STANDARD: { maxGraphemes: 120, maxLogicalLines: 4 },
  EXPANDED: { maxGraphemes: 160, maxLogicalLines: 6 },
};

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
  semaCode: 'SEMA-0270',
  dateKst: '2026-09-27',
  primaryQuestion: {
    questionId: 'synthetic-q1',
    version: '1',
    role: 'PRIMARY',
    text: '오늘 하루를 색으로 표현한다면 어떤 색인가요?',
  },
  alternateQuestion: {
    questionId: 'synthetic-q2',
    version: '1',
    role: 'ALTERNATE',
    text: '요즘 나를 가장 자주 웃게 하는 것은 무엇인가요?',
  },
};

export const SYNTHETIC_NEXT_DAY_SEMA: MockSema = {
  ...SYNTHETIC_SEMA,
  dailySemaId: 'synthetic-day-2',
  semaId: 'synthetic-sema-2',
  semaCode: 'SEMA-0271',
  dateKst: '2026-09-28',
  primaryQuestion: {
    ...SYNTHETIC_SEMA.primaryQuestion,
    questionId: 'synthetic-q3',
    text: '요즘 자꾸 미루게 되는 일이 있다면, 그 일의 어떤 부분이 무거운가요?',
  },
  alternateQuestion: {
    ...SYNTHETIC_SEMA.alternateQuestion,
    questionId: 'synthetic-q4',
    text: '오늘 하루 중 가장 조용했던 순간은 언제였나요?',
  },
};

export const SYNTHETIC_REPLACED_SEMA: MockSema = {
  ...SYNTHETIC_SEMA,
  semaId: 'synthetic-sema-replaced',
  semaCode: 'SEMA-0270R',
  primaryQuestion: {
    ...SYNTHETIC_SEMA.primaryQuestion,
    questionId: 'synthetic-q5',
    text: '오늘 나에게 가장 오래 남은 소리는 무엇이었나요?',
  },
};

export interface MockWorld {
  passengers: Map<string, Passenger>;
  policies: MockPolicy[];
  creations: MockCreation[];
  nicknameReceipts: MockNicknameReceipt[];
  sessions: Map<string, SessionRecord>;
  sema: MockSema;
  answers: Map<string, MockAnswer>;
  tickets: Map<string, MockTicket>;
  deletions: Map<string, MockDeletion>;
  productEvents: Map<string, MockProductEvent>;
  deletionCommitFails: boolean;
  deletionFence(anonymousKey: string): MockDeletion | undefined;
  asyncExecution: boolean;
  presentationUnavailable: boolean;
  advanceDayOnFirstPrepare: boolean;
  completeExecuting(): void;
  faults: Map<MockOp, MockFault[]>;
  requests: { op: MockOp; bearer: string | null }[];
  issueToken(anonymousKey: string): string;
  revokeSessions(anonymousKey: string): void;
  takeFault(op: MockOp): MockFault | undefined;
  addFault(op: MockOp, ...faults: MockFault[]): void;
  answersOf(owner: string): MockAnswer[];
  seedAnswer(owner: string, content: string, overrides?: Partial<MockAnswer>): MockAnswer;
}

export type ServerBase = 'server.prePassenger' | 'server.activeUnanswered' | 'server.activeAnswered';

export const SYNTHETIC_ANSWER_TEXT =
  '옅은 회청색. 비가 올 듯 말 듯한 하늘이 하루 종일 이어졌다.\n우산을 안 들고 나갔는데 결국 비는 오지 않았다.';

export function createMockWorld(base: ServerBase): MockWorld {
  const passengers = new Map<string, Passenger>();
  if (base !== 'server.prePassenger') {
    passengers.set(SYNTHETIC_KEYS.registered, {
      passengerCode: 'ARC-2417',
      nickname: null,
      revision: 'p-r1',
      dataGeneration: 'gen-synthetic-1',
    });
  }
  const sessions = new Map<string, SessionRecord>();
  const faults = new Map<MockOp, MockFault[]>();
  const answers = new Map<string, MockAnswer>();
  const tickets = new Map<string, MockTicket>();
  const deletions = new Map<string, MockDeletion>();
  const productEvents = new Map<string, MockProductEvent>();
  let tokenSeq = 0;
  let answerSeq = 0;
  let revisionSeq = 1;

  const world: MockWorld = {
    passengers,
    policies: SYNTHETIC_POLICIES.map((p) => ({ ...p })),
    creations: [],
    nicknameReceipts: [],
    sessions,
    sema: SYNTHETIC_SEMA,
    answers,
    tickets,
    deletions,
    productEvents,
    deletionCommitFails: false,
    deletionFence(anonymousKey) {
      return [...deletions.values()].find(
        (d) => d.owner === anonymousKey && (d.state === 'PREPARED' || d.state === 'EXECUTING'),
      );
    },
    asyncExecution: false,
    presentationUnavailable: false,
    advanceDayOnFirstPrepare: false,
    completeExecuting() {
      for (const deletion of deletions.values()) {
        if (deletion.state !== 'EXECUTING') continue;
        if (world.deletionCommitFails) {
          world.deletionCommitFails = false;
          deletion.state = 'NOT_APPLIED';
          deletion.error = { code: 'ALL_DATA_DELETE_FAILED', category: 'MAINTENANCE' };
          continue;
        }
        const owner = deletion.owner;
        passengers.delete(owner);
        for (const answer of [...answers.values()]) if (answer.owner === owner) answers.delete(answer.answerId);
        for (const ticket of [...tickets.values()]) if (ticket.owner === owner) tickets.delete(ticket.ticketId);
        world.nicknameReceipts = world.nicknameReceipts.filter((r) => r.anonymousKey !== owner);
        for (const event of [...productEvents.values()]) if (event.owner === owner) productEvents.delete(event.eventId);
        deletion.state = 'SUCCEEDED';
      }
      for (const ticket of tickets.values()) {
        if (ticket.state !== 'EXECUTING') continue;
        const target = ticket.answerTarget;
        if (target) {
          const current = answers.get(target.answerId);
          ticket.completedAt = '2026-09-27T02:00:00Z';
          if (target.kind === 'DELETE' && !current) {
            ticket.state = 'SUCCEEDED';
            ticket.deleteEffect = 'ALREADY_ABSENT';
            ticket.answerId = target.answerId;
          } else if (!current) {
            ticket.state = 'NOT_APPLIED';
            ticket.error = { code: 'ANSWER_NOT_FOUND', category: 'VALIDATION' };
          } else if (current.revision !== target.expectedRevision) {
            ticket.state = 'NOT_APPLIED';
            ticket.error = { code: 'REVISION_CONFLICT', category: 'CONFLICT' };
          } else if (target.kind === 'DELETE') {
            answers.delete(target.answerId);
            ticket.state = 'SUCCEEDED';
            ticket.deleteEffect = 'DELETED';
            ticket.answerId = target.answerId;
          } else {
            revisionSeq += 1;
            current.content = ticket.pendingContent ?? current.content;
            current.revision = `a-r${revisionSeq}`;
            current.updatedAt = '2026-09-27T02:00:00Z';
            current.isEdited = true;
            ticket.proofRevision = current.revision;
            ticket.state = 'SUCCEEDED';
            ticket.answerId = current.answerId;
          }
          ticket.pendingContent = null;
          continue;
        }
        if (ticket.pendingContent === null) continue;
        const answer = world.seedAnswer(ticket.owner, ticket.pendingContent, {
          dailySemaId: ticket.dailySemaId,
          question: ticket.question,
          createdAt: '2026-09-27T02:00:00Z',
          updatedAt: '2026-09-27T02:00:00Z',
        });
        ticket.state = 'SUCCEEDED';
        ticket.answerId = answer.answerId;
        ticket.proofRevision = answer.revision;
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
