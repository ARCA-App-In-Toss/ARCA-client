export type SessionMode = 'PRE_PASSENGER' | 'ACTIVE' | 'DELETION_RECOVERY';

export type SessionContext =
  | { mode: 'PRE_PASSENGER' }
  | { mode: 'ACTIVE'; dataGeneration: string }
  | { mode: 'DELETION_RECOVERY'; dataGeneration: string; deletionTicketId: string };

export interface ConsentPolicy {
  policyId: string;
  version: string;
  title: string;
  url: string;
  required: boolean;
}

export interface RecentDeletion {
  ticketId: string;
  deletedGeneration: string;
  resultExpiresAt: string;
}

export interface EstablishedSession {
  accessToken: string;
  expiresAt: string;
  context: SessionContext;
  consentPolicies: readonly ConsentPolicy[];
  recentDeletion: RecentDeletion | null;
}

export interface ConsentReceipt {
  policyId: string;
  version: string;
}

export interface PassengerProfile {
  passengerCode: string;
  nickname: string | null;
  revision: string;
}

export interface NicknameReceipt {
  operationId: string;
  profile: PassengerProfile;
  resultExpiresAt: string;
}

export interface CreatedPassenger {
  session: EstablishedSession;
  passenger: PassengerProfile;
}

export interface QuestionSnapshot {
  questionId: string;
  version: string;
  role: 'PRIMARY' | 'ALTERNATE';
  text: string;
}

export interface TodaySema {
  dailySemaId: string;
  semaId: string;
  version: string;
  semaCode: string;
  dateKst: string;
  primaryQuestion: QuestionSnapshot;
  alternateQuestion: QuestionSnapshot;
}

export type Availability<T> = { state: 'AVAILABLE'; value: T } | { state: 'UNAVAILABLE'; retryable: boolean };

export interface Excerpt {
  sourceRevision: string;
  text: string;
  isTruncated: boolean;
}

export interface TodayAnswer {
  answerId: string;
  revision: string;
  question: QuestionSnapshot;
  excerpt: Availability<Excerpt>;
}

export interface Today {
  dateKst: string;
  sema: TodaySema;
  answer: { state: 'UNANSWERED' } | { state: 'ANSWERED'; value: TodayAnswer };
  activeAnswerCount: Availability<{ count: number; observedAt: string }>;
}

export type ExcerptProfile = 'COMPACT' | 'STANDARD' | 'EXPANDED';

export interface AnswerDetail {
  answerId: string;
  revision: string;
  createdDateKst: string;
  isEdited: boolean;
  question: QuestionSnapshot;
  content: string;
}

export interface PrepareAnswerCreate {
  mode: 'CREATE';
  dailySemaId: string;
  semaId: string;
  semaVersion: string;
  questionId: string;
  questionVersion: string;
}

export interface PrepareAnswerUpdate {
  mode: 'UPDATE';
  answerId: string;
  expectedRevision: string;
}

export type PrepareAnswerWrite = PrepareAnswerCreate | PrepareAnswerUpdate;

export interface PrepareAnswerDelete {
  answerId: string;
  expectedRevision: string;
}

export type AnswerWritePresentation =
  | {
      state: 'AVAILABLE';
      question: QuestionSnapshot;
      excerpt: Availability<Excerpt>;
      activeAnswerCount: Availability<{ count: number; observedAt: string }>;
    }
  | { state: 'UNAVAILABLE'; retryable: boolean }
  | { state: 'ACKNOWLEDGED' }
  | { state: 'RESOURCE_CHANGED' };

export type AnswerWriteResult =
  | { state: 'PREPARED'; ticketId: string; operationId: string }
  | { state: 'EXECUTING'; ticketId: string; operationId: string }
  | {
      state: 'SUCCEEDED';
      ticketId: string;
      operationId: string;
      proof: { answerId: string; revision: string; mode: 'CREATED' | 'UPDATED' };
      presentation: AnswerWritePresentation;
    }
  | { state: 'NOT_APPLIED'; ticketId: string; operationId: string; error: { code: string; category: string } }
  | { state: 'CLOSED_OUTCOME_UNAVAILABLE'; ticketId: string; operationId: string };

export type Reconciliation =
  | { checkedAt: string; nextAction: 'CREATE_CURRENT_DAY' | 'RETURN_TODAY' | 'RETURN_ARCHIVE' }
  | { checkedAt: string; nextAction: 'REVIEW_CURRENT_ANSWER'; answerId: string; revision: string };

export type AnswerWriteClosure =
  | Extract<AnswerWriteResult, { state: 'SUCCEEDED' | 'NOT_APPLIED' | 'EXECUTING' }>
  | { state: 'CLOSED_OUTCOME_UNAVAILABLE'; ticketId: string; operationId: string; reconciliation: Reconciliation };

export interface ArchiveItem {
  answerId: string;
  revision: string;
  createdDateKst: string;
  question: QuestionSnapshot;
  excerpt: Availability<Excerpt>;
}

export interface AnswerPage {
  items: ArchiveItem[];
  nextCursor: string | null;
}

export type AnswerDeletePresentation =
  | { state: 'AVAILABLE'; activeAnswerCount: Availability<{ count: number; observedAt: string }> }
  | { state: 'UNAVAILABLE'; retryable: boolean }
  | { state: 'ACKNOWLEDGED' };

export type AnswerDeleteResult =
  | { state: 'PREPARED'; ticketId: string; operationId: string }
  | { state: 'EXECUTING'; ticketId: string; operationId: string }
  | {
      state: 'SUCCEEDED';
      ticketId: string;
      operationId: string;
      proof: { answerId: string; effect: 'DELETED' | 'ALREADY_ABSENT'; deletedAt: string };
      presentation: AnswerDeletePresentation;
    }
  | { state: 'NOT_APPLIED'; ticketId: string; operationId: string; error: { code: string; category: string } }
  | { state: 'CLOSED_OUTCOME_UNAVAILABLE'; ticketId: string; operationId: string };

export type AnswerDeleteClosure =
  | Extract<AnswerDeleteResult, { state: 'SUCCEEDED' | 'NOT_APPLIED' | 'EXECUTING' }>
  | { state: 'CLOSED_OUTCOME_UNAVAILABLE'; ticketId: string; operationId: string; reconciliation: Reconciliation };

export interface AllDataDeleteProof {
  deletedAt: string;
  consentEvidenceRetainedUntil: string;
  backupsExpireBy: string;
}

export type AllDataDeleteResult =
  | { state: 'PREPARED'; ticketId: string; operationId: string }
  | { state: 'EXECUTING'; ticketId: string; operationId: string }
  | { state: 'SUCCEEDED'; ticketId: string; operationId: string; resultExpiresAt: string; proof: AllDataDeleteProof }
  | { state: 'NOT_APPLIED'; ticketId: string; operationId: string; error: { code: string; category: string } }
  | { state: 'CLOSED_OUTCOME_UNAVAILABLE'; ticketId: string; operationId: string };

export type AllDataDeleteClosure =
  | Extract<AllDataDeleteResult, { state: 'SUCCEEDED' | 'NOT_APPLIED' | 'EXECUTING' }>
  | { state: 'CLOSED_OUTCOME_UNAVAILABLE'; ticketId: string; operationId: string; reconciliation: Reconciliation };
