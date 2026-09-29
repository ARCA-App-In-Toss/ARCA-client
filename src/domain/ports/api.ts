import type {
  AllDataDeleteClosure,
  AllDataDeleteResult,
  AnswerDeleteClosure,
  AnswerDeleteResult,
  AnswerDetail,
  AnswerPage,
  AnswerWriteClosure,
  AnswerWriteResult,
  ConsentReceipt,
  CreatedPassenger,
  EstablishedSession,
  ExcerptProfile,
  NicknameReceipt,
  PassengerProfile,
  PrepareAnswerDelete,
  PrepareAnswerWrite,
  Today,
} from '../models.ts';

export interface Bearer {
  readonly bearer: string;
}

export interface ArcaApi {
  establishSession(anonymousKey: string): Promise<EstablishedSession>;
  createPassenger(auth: Bearer, operationId: string, consents: readonly ConsentReceipt[]): Promise<CreatedPassenger>;
  getPassenger(auth: Bearer, signal?: AbortSignal): Promise<PassengerProfile>;
  setNickname(
    auth: Bearer,
    operationId: string,
    nickname: string | null,
    expectedRevision: string,
  ): Promise<NicknameReceipt>;
  getToday(auth: Bearer, excerptProfile: ExcerptProfile, signal?: AbortSignal): Promise<Today>;
  listAnswers(
    auth: Bearer,
    cursor: string | null,
    excerptProfile: ExcerptProfile,
    signal?: AbortSignal,
  ): Promise<AnswerPage>;
  getAnswer(auth: Bearer, answerId: string, signal?: AbortSignal): Promise<AnswerDetail>;
  prepareAnswerWrite(
    auth: Bearer,
    operationId: string,
    input: PrepareAnswerWrite,
    timeoutMs: number,
  ): Promise<AnswerWriteResult>;
  executeAnswerWrite(auth: Bearer, ticketId: string, content: string, timeoutMs: number): Promise<AnswerWriteResult>;
  getAnswerWriteResult(
    auth: Bearer,
    ticketId: string,
    excerptProfile: ExcerptProfile,
    timeoutMs: number,
  ): Promise<AnswerWriteResult>;
  acknowledgeCommand(auth: Bearer, ticketId: string): Promise<void>;
  closeAnswerWrite(auth: Bearer, ticketId: string, timeoutMs: number): Promise<AnswerWriteClosure>;
  prepareAnswerDelete(
    auth: Bearer,
    operationId: string,
    input: PrepareAnswerDelete,
    timeoutMs: number,
  ): Promise<AnswerDeleteResult>;
  executeAnswerDelete(auth: Bearer, ticketId: string, timeoutMs: number): Promise<AnswerDeleteResult>;
  getAnswerDeleteResult(auth: Bearer, ticketId: string, timeoutMs: number): Promise<AnswerDeleteResult>;
  closeAnswerDelete(auth: Bearer, ticketId: string, timeoutMs: number): Promise<AnswerDeleteClosure>;
  prepareAllDataDelete(auth: Bearer, operationId: string, timeoutMs: number): Promise<AllDataDeleteResult>;
  executeAllDataDelete(auth: Bearer, ticketId: string, timeoutMs: number): Promise<AllDataDeleteResult>;
  getAllDataDeleteResult(auth: Bearer, ticketId: string, timeoutMs: number): Promise<AllDataDeleteResult>;
  closeAllDataDelete(auth: Bearer, ticketId: string, timeoutMs: number): Promise<AllDataDeleteClosure>;
}
