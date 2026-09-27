// Domain-facing shapes produced by ArcaApi. Screens and domain code depend on these, never on
// generated wire DTOs (06 §3.2).

export type SessionMode = 'PRE_PASSENGER' | 'ACTIVE' | 'DELETION_RECOVERY';

export type SessionContext =
  | { mode: 'PRE_PASSENGER' }
  | { mode: 'ACTIVE'; dataGeneration: string }
  /** Restricted: only this deletion ticket's OP-007 resend/008/009/015 (05 §6.1 #4). */
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

/** Access token is opaque; it is handed only to SessionController and never copied further. */
export interface EstablishedSession {
  accessToken: string;
  expiresAt: string;
  context: SessionContext;
  consentPolicies: readonly ConsentPolicy[];
  recentDeletion: RecentDeletion | null;
}

/** One required policy the user agreed to, by exact ID and version (05 §6.2). */
export interface ConsentReceipt {
  policyId: string;
  version: string;
}

export interface PassengerProfile {
  passengerCode: string;
  nickname: string | null;
  revision: string;
}

/** OP-004 result: proof of the profile when this request applied, not the current profile (05 §5.2). */
export interface NicknameReceipt {
  operationId: string;
  profile: PassengerProfile;
  resultExpiresAt: string;
}

/** OP-003 result: the ACTIVE session goes to SessionController, the profile to F03. */
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
  /** Stored original text; never trimmed or normalized. */
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

/** OP-006 UPDATE: ownership and the expected revision are fixed; the question snapshot never changes. */
export interface PrepareAnswerUpdate {
  mode: 'UPDATE';
  answerId: string;
  expectedRevision: string;
}

export type PrepareAnswerWrite = PrepareAnswerCreate | PrepareAnswerUpdate;

/** OP-012 input (05 §6.5). */
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

/** OP-006/007/008 answer-write result (05 §5.5). Only SUCCEEDED/NOT_APPLIED are terminal outcomes. */
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

/** Server snapshot guidance after an explicit close; never a permission for the next change (05 OP-015). */
export type Reconciliation =
  | { checkedAt: string; nextAction: 'CREATE_CURRENT_DAY' | 'RETURN_TODAY' | 'RETURN_ARCHIVE' }
  | { checkedAt: string; nextAction: 'REVIEW_CURRENT_ANSWER'; answerId: string; revision: string };

/** OP-015 answer-write result: the settled result, the unchanged EXECUTING state, or a sealed past command. */
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

/** OP-012/007/008 answer-delete result (05 §5.5, §10.2). ALREADY_ABSENT joins the success. */
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

/** Full-deletion receipt: times only, no content or profile (05 §5.5, §10.3). */
export interface AllDataDeleteProof {
  deletedAt: string;
  consentEvidenceRetainedUntil: string;
  backupsExpireBy: string;
}

/** OP-013/007/008 all-data-delete result (05 §6.6). Nothing but SUCCEEDED means data was deleted. */
export type AllDataDeleteResult =
  | { state: 'PREPARED'; ticketId: string; operationId: string }
  | { state: 'EXECUTING'; ticketId: string; operationId: string }
  | { state: 'SUCCEEDED'; ticketId: string; operationId: string; resultExpiresAt: string; proof: AllDataDeleteProof }
  | { state: 'NOT_APPLIED'; ticketId: string; operationId: string; error: { code: string; category: string } }
  | { state: 'CLOSED_OUTCOME_UNAVAILABLE'; ticketId: string; operationId: string };

export type AllDataDeleteClosure =
  | Extract<AllDataDeleteResult, { state: 'SUCCEEDED' | 'NOT_APPLIED' | 'EXECUTING' }>
  | { state: 'CLOSED_OUTCOME_UNAVAILABLE'; ticketId: string; operationId: string; reconciliation: Reconciliation };
