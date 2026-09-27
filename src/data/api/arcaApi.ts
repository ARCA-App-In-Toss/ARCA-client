import type { z } from 'zod';
import { ProtocolFailure, TransportFailure } from '../failures.ts';
import { toDomainFailure } from './errorEnvelope.ts';
import {
  zAnswerDetail,
  zAnswerPage,
  zAnswerWriteCommandResult,
  zCreatePassengerResponse,
  zEstablishSessionResponse,
  zGetPassengerResponse,
  zNicknameReceipt,
  zTodayReadModel,
} from './generated/zod.gen.ts';
import type {
  AnswerDetail,
  AnswerPage,
  AnswerWriteResult,
  Availability,
  ConsentReceipt,
  CreatedPassenger,
  EstablishedSession,
  Excerpt,
  ExcerptProfile,
  NicknameReceipt,
  PassengerProfile,
  PrepareAnswerCreate,
  SessionContext,
  Today,
} from './models.ts';
import type { HttpRequest, HttpTransport } from './transport.ts';

/** Safe query transport budget and single connectivity retry (06 §6.2). */
export const SAFE_QUERY_TIMEOUT_MS = 8_000;
const SESSION_TIMEOUT_MS = 8_000;
/** OP-003 transport budget. Timeout or loss says nothing about the creation outcome (05 §8.3). */
export const CREATE_PASSENGER_TIMEOUT_MS = 10_000;
/** OP-004 transport budget; a timeout is resolved by resending the same key (05 §6.2). */
export const SET_NICKNAME_TIMEOUT_MS = 10_000;

export interface Bearer {
  readonly bearer: string;
}

export interface ArcaApi {
  /** OP-001. Creates no passenger. */
  establishSession(anonymousKey: string): Promise<EstablishedSession>;
  /**
   * OP-003. `operationId` travels only as the Idempotency-Key header. The response carries a new ACTIVE
   * session; only SessionController may call this.
   */
  createPassenger(auth: Bearer, operationId: string, consents: readonly ConsentReceipt[]): Promise<CreatedPassenger>;
  /** OP-002: the current profile, never proof that a particular nickname request applied. */
  getPassenger(auth: Bearer, signal?: AbortSignal): Promise<PassengerProfile>;
  /** OP-004. `nickname: null` clears; `operationId` travels only as the Idempotency-Key header. */
  setNickname(
    auth: Bearer,
    operationId: string,
    nickname: string | null,
    expectedRevision: string,
  ): Promise<NicknameReceipt>;
  /** OP-005. */
  getToday(auth: Bearer, excerptProfile: ExcerptProfile, signal?: AbortSignal): Promise<Today>;
  /** OP-010. `cursor` is the opaque value from the previous page only. */
  listAnswers(
    auth: Bearer,
    cursor: string | null,
    excerptProfile: ExcerptProfile,
    signal?: AbortSignal,
  ): Promise<AnswerPage>;
  /** OP-011. */
  getAnswer(auth: Bearer, answerId: string, signal?: AbortSignal): Promise<AnswerDetail>;
  /** OP-006. `operationId` travels only as the Idempotency-Key header (05 §7.2). */
  prepareAnswerWrite(
    auth: Bearer,
    operationId: string,
    input: PrepareAnswerCreate,
    timeoutMs: number,
  ): Promise<AnswerWriteResult>;
  /** OP-007. Timeout or loss says nothing about the outcome; use OP-008 (05 §8.3). */
  executeAnswerWrite(auth: Bearer, ticketId: string, content: string, timeoutMs: number): Promise<AnswerWriteResult>;
  /** OP-008 (safe query). */
  getAnswerWriteResult(
    auth: Bearer,
    ticketId: string,
    excerptProfile: ExcerptProfile,
    timeoutMs: number,
  ): Promise<AnswerWriteResult>;
  /** OP-009. */
  acknowledgeCommand(auth: Bearer, ticketId: string): Promise<void>;
}

async function send<S extends z.ZodType>(
  transport: HttpTransport,
  request: HttpRequest,
  expectedStatus: number | readonly number[],
  schema: S,
): Promise<z.output<S>> {
  const response = await transport(request);
  const expected = typeof expectedStatus === 'number' ? [expectedStatus] : expectedStatus;
  if (expected.includes(response.status)) {
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) throw new ProtocolFailure('schema');
    return parsed.data;
  }
  if (response.status >= 400) throw toDomainFailure(response.body);
  throw new ProtocolFailure('status');
}

async function sendSafeQuery<S extends z.ZodType>(
  transport: HttpTransport,
  request: HttpRequest,
  schema: S,
): Promise<z.output<S>> {
  try {
    return await send(transport, request, 200, schema);
  } catch (error) {
    const connectivity =
      error instanceof TransportFailure && (error.reason === 'network' || error.reason === 'timeout');
    if (!connectivity || request.signal?.aborted) throw error;
    return send(transport, request, 200, schema);
  }
}

function toSessionContext(context: z.output<typeof zEstablishSessionResponse>['context']): SessionContext {
  switch (context.mode) {
    case 'PRE_PASSENGER':
      return { mode: 'PRE_PASSENGER' };
    case 'ACTIVE':
      return { mode: 'ACTIVE', dataGeneration: context.dataGeneration };
    case 'DELETION_RECOVERY':
      return { mode: 'DELETION_RECOVERY', dataGeneration: context.dataGeneration };
  }
}

function toToday(wire: z.output<typeof zTodayReadModel>): Today {
  const { sema, answer, activeAnswerCount } = wire;
  return {
    dateKst: wire.dateKst,
    sema: {
      dailySemaId: sema.dailySemaId,
      semaId: sema.semaId,
      version: sema.version,
      semaCode: sema.semaCode,
      dateKst: sema.dateKst,
      primaryQuestion: { ...sema.primaryQuestion },
      alternateQuestion: { ...sema.alternateQuestion },
    },
    answer:
      answer.state === 'UNANSWERED'
        ? { state: 'UNANSWERED' }
        : {
            state: 'ANSWERED',
            value: {
              answerId: answer.value.answerId,
              revision: answer.value.revision,
              question: { ...answer.value.question },
              excerpt:
                answer.value.excerpt.state === 'AVAILABLE'
                  ? {
                      state: 'AVAILABLE',
                      value: {
                        sourceRevision: answer.value.excerpt.value.sourceRevision,
                        text: answer.value.excerpt.value.text,
                        isTruncated: answer.value.excerpt.value.isTruncated,
                      },
                    }
                  : { state: 'UNAVAILABLE', retryable: answer.value.excerpt.retryable },
            },
          },
    activeAnswerCount:
      activeAnswerCount.state === 'AVAILABLE'
        ? { state: 'AVAILABLE', value: { ...activeAnswerCount.value } }
        : { state: 'UNAVAILABLE', retryable: activeAnswerCount.retryable },
  };
}

function toAvailability<
  W extends { state: 'AVAILABLE'; value: unknown } | { state: 'UNAVAILABLE'; retryable: boolean },
  T,
>(wire: W, map: (value: Extract<W, { state: 'AVAILABLE' }>['value']) => T): Availability<T> {
  return wire.state === 'AVAILABLE'
    ? { state: 'AVAILABLE', value: map((wire as Extract<W, { state: 'AVAILABLE' }>).value) }
    : { state: 'UNAVAILABLE', retryable: (wire as { retryable: boolean }).retryable };
}

function toAnswerWriteResult(wire: z.output<typeof zAnswerWriteCommandResult>): AnswerWriteResult {
  const base = { ticketId: wire.ticketId, operationId: wire.operationId };
  switch (wire.state) {
    case 'PREPARED':
      return { state: 'PREPARED', ...base };
    case 'EXECUTING':
      return { state: 'EXECUTING', ...base };
    case 'NOT_APPLIED':
      return { state: 'NOT_APPLIED', ...base, error: { code: wire.error.code, category: wire.error.category } };
    case 'CLOSED_OUTCOME_UNAVAILABLE':
      return { state: 'CLOSED_OUTCOME_UNAVAILABLE', ...base };
    case 'SUCCEEDED': {
      const p = wire.presentation;
      return {
        state: 'SUCCEEDED',
        ...base,
        proof: { answerId: wire.proof.answerId, revision: wire.proof.revision, mode: wire.proof.mode },
        presentation:
          p.state === 'AVAILABLE'
            ? {
                state: 'AVAILABLE',
                question: { ...p.value.question },
                excerpt: toAvailability(
                  p.value.excerpt,
                  (e): Excerpt => ({
                    sourceRevision: e.sourceRevision,
                    text: e.text,
                    isTruncated: e.isTruncated,
                  }),
                ),
                activeAnswerCount: toAvailability(p.value.activeAnswerCount, (c) => ({ ...c })),
              }
            : p.state === 'UNAVAILABLE'
              ? { state: 'UNAVAILABLE', retryable: p.retryable }
              : { state: p.state },
      };
    }
  }
}

export function createArcaApi(transport: HttpTransport): ArcaApi {
  return {
    async establishSession(anonymousKey) {
      const wire = await send(
        transport,
        { method: 'POST', path: '/sessions', body: { anonymousKey }, timeoutMs: SESSION_TIMEOUT_MS },
        201,
        zEstablishSessionResponse,
      );
      return {
        accessToken: wire.accessToken,
        expiresAt: wire.expiresAt,
        context: toSessionContext(wire.context),
        consentPolicies: wire.consentPolicies.map((policy) => ({ ...policy })),
        recentDeletion: wire.recentDeletion
          ? {
              deletedGeneration: wire.recentDeletion.deletedGeneration,
              resultExpiresAt: wire.recentDeletion.resultExpiresAt,
            }
          : null,
      };
    },

    async createPassenger(auth, operationId, consents) {
      const wire = await send(
        transport,
        {
          method: 'POST',
          path: '/passenger',
          bearer: auth.bearer,
          idempotencyKey: operationId,
          body: { consents: consents.map((c) => ({ policyId: c.policyId, version: c.version, agreed: true })) },
          timeoutMs: CREATE_PASSENGER_TIMEOUT_MS,
        },
        [200, 201],
        zCreatePassengerResponse,
      );
      const { passenger } = wire.context;
      return {
        session: {
          accessToken: wire.accessToken,
          expiresAt: wire.expiresAt,
          context: { mode: 'ACTIVE', dataGeneration: wire.context.dataGeneration },
          consentPolicies: wire.consentPolicies.map((policy) => ({ ...policy })),
          recentDeletion: wire.recentDeletion
            ? {
                deletedGeneration: wire.recentDeletion.deletedGeneration,
                resultExpiresAt: wire.recentDeletion.resultExpiresAt,
              }
            : null,
        },
        passenger: {
          passengerCode: passenger.passengerCode,
          nickname: passenger.nickname,
          revision: passenger.revision,
        },
      };
    },

    async getPassenger(auth, signal) {
      const request: HttpRequest = {
        method: 'GET',
        path: '/passenger',
        bearer: auth.bearer,
        timeoutMs: SAFE_QUERY_TIMEOUT_MS,
      };
      if (signal) request.signal = signal;
      const wire = await sendSafeQuery(transport, request, zGetPassengerResponse);
      return { passengerCode: wire.passengerCode, nickname: wire.nickname, revision: wire.revision };
    },

    async setNickname(auth, operationId, nickname, expectedRevision) {
      const wire = await send(
        transport,
        {
          method: 'PUT',
          path: '/passenger/nickname',
          bearer: auth.bearer,
          idempotencyKey: operationId,
          body: { nickname, expectedRevision },
          timeoutMs: SET_NICKNAME_TIMEOUT_MS,
        },
        200,
        zNicknameReceipt,
      );
      const { profile } = wire;
      return {
        operationId: wire.operationId,
        profile: { passengerCode: profile.passengerCode, nickname: profile.nickname, revision: profile.revision },
        resultExpiresAt: wire.resultExpiresAt,
      };
    },

    async getToday(auth, excerptProfile, signal) {
      const request: HttpRequest = {
        method: 'GET',
        path: '/today',
        query: { excerptProfile },
        bearer: auth.bearer,
        timeoutMs: SAFE_QUERY_TIMEOUT_MS,
      };
      if (signal) request.signal = signal;
      return toToday(await sendSafeQuery(transport, request, zTodayReadModel));
    },

    async prepareAnswerWrite(auth, operationId, input, timeoutMs) {
      const wire = await send(
        transport,
        {
          method: 'POST',
          path: '/answer-write-commands',
          bearer: auth.bearer,
          idempotencyKey: operationId,
          body: input,
          timeoutMs,
        },
        [200, 201],
        zAnswerWriteCommandResult,
      );
      return toAnswerWriteResult(wire);
    },

    async executeAnswerWrite(auth, ticketId, content, timeoutMs) {
      const wire = await send(
        transport,
        {
          method: 'PUT',
          path: `/commands/${encodeURIComponent(ticketId)}/execution`,
          bearer: auth.bearer,
          body: { kind: 'ANSWER_WRITE', content },
          timeoutMs,
        },
        [200, 202],
        zAnswerWriteCommandResult,
      );
      return toAnswerWriteResult(wire);
    },

    async getAnswerWriteResult(auth, ticketId, excerptProfile, timeoutMs) {
      const wire = await send(
        transport,
        {
          method: 'GET',
          path: `/commands/${encodeURIComponent(ticketId)}`,
          query: { excerptProfile },
          bearer: auth.bearer,
          timeoutMs,
        },
        200,
        zAnswerWriteCommandResult,
      );
      return toAnswerWriteResult(wire);
    },

    async acknowledgeCommand(auth, ticketId) {
      const response = await transport({
        method: 'PUT',
        path: `/commands/${encodeURIComponent(ticketId)}/acknowledgement`,
        bearer: auth.bearer,
        body: {},
        timeoutMs: SAFE_QUERY_TIMEOUT_MS,
      });
      if (response.status === 204) return;
      if (response.status >= 400) throw toDomainFailure(response.body);
      throw new ProtocolFailure('status');
    },

    async listAnswers(auth, cursor, excerptProfile, signal) {
      const query: Record<string, string> = { excerptProfile };
      if (cursor) query.cursor = cursor;
      const request: HttpRequest = {
        method: 'GET',
        path: '/answers',
        query,
        bearer: auth.bearer,
        timeoutMs: SAFE_QUERY_TIMEOUT_MS,
      };
      if (signal) request.signal = signal;
      const wire = await sendSafeQuery(transport, request, zAnswerPage);
      return {
        nextCursor: wire.nextCursor,
        items: wire.items.map((item) => ({
          answerId: item.answerId,
          revision: item.revision,
          createdDateKst: item.createdDateKst,
          question: { ...item.question },
          excerpt: toAvailability(
            item.excerpt,
            (e): Excerpt => ({
              sourceRevision: e.sourceRevision,
              text: e.text,
              isTruncated: e.isTruncated,
            }),
          ),
        })),
      };
    },

    async getAnswer(auth, answerId, signal) {
      const request: HttpRequest = {
        method: 'GET',
        path: `/answers/${encodeURIComponent(answerId)}`,
        bearer: auth.bearer,
        timeoutMs: SAFE_QUERY_TIMEOUT_MS,
      };
      if (signal) request.signal = signal;
      const wire = await sendSafeQuery(transport, request, zAnswerDetail);
      return {
        answerId: wire.answerId,
        revision: wire.revision,
        createdDateKst: wire.createdDateKst,
        isEdited: wire.isEdited,
        question: { ...wire.question },
        content: wire.content,
      };
    },
  };
}
