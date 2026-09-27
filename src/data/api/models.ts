// Domain-facing shapes produced by ArcaApi. Screens and domain code depend on these, never on
// generated wire DTOs (06 §3.2).

export type SessionMode = 'PRE_PASSENGER' | 'ACTIVE' | 'DELETION_RECOVERY';

export type SessionContext =
  | { mode: 'PRE_PASSENGER' }
  | { mode: 'ACTIVE'; dataGeneration: string }
  | { mode: 'DELETION_RECOVERY'; dataGeneration: string };

export interface ConsentPolicy {
  policyId: string;
  version: string;
  title: string;
  url: string;
  required: boolean;
}

export interface RecentDeletion {
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
