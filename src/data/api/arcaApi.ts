import { z } from 'zod';
import { ProtocolFailure, TransportFailure } from '../../domain/failures.ts';
import type {
  AllDataDeleteClosure,
  AllDataDeleteResult,
  AnswerDeleteClosure,
  AnswerDeleteResult,
  AnswerWriteClosure,
  AnswerWriteResult,
  Availability,
  Excerpt,
  Reconciliation,
  SessionContext,
  Today,
} from '../../domain/models.ts';
import type { ArcaApi } from '../../domain/ports/api.ts';
import { toDomainFailure } from './errorEnvelope.ts';
import {
  zAllDataDeleteClosedOutcomeUnavailableReconciled,
  zAllDataDeleteCommandResult,
  zAllDataDeleteExecuting,
  zAllDataDeleteNotApplied,
  zAllDataDeleteSucceeded,
  zAnswerDeleteClosedOutcomeUnavailableReconciled,
  zAnswerDeleteCommandResult,
  zAnswerDeleteExecuting,
  zAnswerDeleteNotApplied,
  zAnswerDeleteSucceeded,
  zAnswerDetail,
  zAnswerPage,
  zAnswerWriteClosedOutcomeUnavailableReconciled,
  zAnswerWriteCommandResult,
  zAnswerWriteExecuting,
  zAnswerWriteNotApplied,
  zAnswerWriteSucceeded,
  zCreatePassengerResponse,
  zEstablishSessionResponse,
  zGetPassengerResponse,
  zNicknameReceipt,
  zTodayReadModel,
} from './generated/zod.gen.ts';
import type { HttpRequest, HttpTransport } from './transport.ts';

export const SAFE_QUERY_TIMEOUT_MS = 8_000;
const SESSION_TIMEOUT_MS = 8_000;
export const CREATE_PASSENGER_TIMEOUT_MS = 10_000;
export const SET_NICKNAME_TIMEOUT_MS = 10_000;

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
      return {
        mode: 'DELETION_RECOVERY',
        dataGeneration: context.dataGeneration,
        deletionTicketId: context.deletionTicketId,
      };
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

function toAnswerDeleteResult(wire: z.output<typeof zAnswerDeleteCommandResult>): AnswerDeleteResult {
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
        proof: { answerId: wire.proof.answerId, effect: wire.proof.effect, deletedAt: wire.proof.deletedAt },
        presentation:
          p.state === 'AVAILABLE'
            ? { state: 'AVAILABLE', activeAnswerCount: toAvailability(p.value.activeAnswerCount, (c) => ({ ...c })) }
            : p.state === 'UNAVAILABLE'
              ? { state: 'UNAVAILABLE', retryable: p.retryable }
              : { state: 'ACKNOWLEDGED' },
      };
    }
  }
}

function toAllDataDeleteResult(wire: z.output<typeof zAllDataDeleteCommandResult>): AllDataDeleteResult {
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
    case 'SUCCEEDED':
      return {
        state: 'SUCCEEDED',
        ...base,
        resultExpiresAt: wire.resultExpiresAt,
        proof: {
          deletedAt: wire.proof.deletedAt,
          consentEvidenceRetainedUntil: wire.proof.consentEvidenceRetainedUntil,
          backupsExpireBy: wire.proof.backupsExpireBy,
        },
      };
  }
}

const zAllDataDeleteClosure = z.union([
  zAllDataDeleteSucceeded,
  zAllDataDeleteNotApplied,
  zAllDataDeleteClosedOutcomeUnavailableReconciled,
]);

const zAnswerDeleteClosure = z.union([
  zAnswerDeleteSucceeded,
  zAnswerDeleteNotApplied,
  zAnswerDeleteClosedOutcomeUnavailableReconciled,
]);

const zAnswerWriteClosure = z.union([
  zAnswerWriteSucceeded,
  zAnswerWriteNotApplied,
  zAnswerWriteClosedOutcomeUnavailableReconciled,
]);

function toReconciliation(
  wire: z.output<typeof zAnswerWriteClosedOutcomeUnavailableReconciled>['reconciliation'],
): Reconciliation {
  return wire.nextAction === 'REVIEW_CURRENT_ANSWER'
    ? { checkedAt: wire.checkedAt, nextAction: wire.nextAction, answerId: wire.answerId, revision: wire.revision }
    : { checkedAt: wire.checkedAt, nextAction: wire.nextAction };
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
              ticketId: wire.recentDeletion.ticketId,
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
                ticketId: wire.recentDeletion.ticketId,
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

    async closeAnswerWrite(auth, ticketId, timeoutMs) {
      const response = await transport({
        method: 'PUT',
        path: `/commands/${encodeURIComponent(ticketId)}/closure`,
        bearer: auth.bearer,
        body: {},
        timeoutMs,
      });
      if (response.status === 202) {
        const parsed = zAnswerWriteExecuting.safeParse(response.body);
        if (!parsed.success) throw new ProtocolFailure('schema');
        return { state: 'EXECUTING', ticketId: parsed.data.ticketId, operationId: parsed.data.operationId };
      }
      if (response.status === 200) {
        const parsed = zAnswerWriteClosure.safeParse(response.body);
        if (!parsed.success) throw new ProtocolFailure('schema');
        const wire = parsed.data;
        if (wire.state === 'CLOSED_OUTCOME_UNAVAILABLE') {
          return {
            state: 'CLOSED_OUTCOME_UNAVAILABLE',
            ticketId: wire.ticketId,
            operationId: wire.operationId,
            reconciliation: toReconciliation(wire.reconciliation),
          };
        }
        return toAnswerWriteResult(wire) as AnswerWriteClosure;
      }
      if (response.status >= 400) throw toDomainFailure(response.body);
      throw new ProtocolFailure('status');
    },

    async prepareAnswerDelete(auth, operationId, input, timeoutMs) {
      const wire = await send(
        transport,
        {
          method: 'POST',
          path: '/answer-delete-commands',
          bearer: auth.bearer,
          idempotencyKey: operationId,
          body: { answerId: input.answerId, expectedRevision: input.expectedRevision },
          timeoutMs,
        },
        [200, 201],
        zAnswerDeleteCommandResult,
      );
      return toAnswerDeleteResult(wire);
    },

    async executeAnswerDelete(auth, ticketId, timeoutMs) {
      const wire = await send(
        transport,
        {
          method: 'PUT',
          path: `/commands/${encodeURIComponent(ticketId)}/execution`,
          bearer: auth.bearer,
          body: { kind: 'ANSWER_DELETE' },
          timeoutMs,
        },
        [200, 202],
        zAnswerDeleteCommandResult,
      );
      return toAnswerDeleteResult(wire);
    },

    async getAnswerDeleteResult(auth, ticketId, timeoutMs) {
      const wire = await send(
        transport,
        { method: 'GET', path: `/commands/${encodeURIComponent(ticketId)}`, bearer: auth.bearer, timeoutMs },
        200,
        zAnswerDeleteCommandResult,
      );
      return toAnswerDeleteResult(wire);
    },

    async closeAnswerDelete(auth, ticketId, timeoutMs) {
      const response = await transport({
        method: 'PUT',
        path: `/commands/${encodeURIComponent(ticketId)}/closure`,
        bearer: auth.bearer,
        body: {},
        timeoutMs,
      });
      if (response.status === 202) {
        const parsed = zAnswerDeleteExecuting.safeParse(response.body);
        if (!parsed.success) throw new ProtocolFailure('schema');
        return { state: 'EXECUTING', ticketId: parsed.data.ticketId, operationId: parsed.data.operationId };
      }
      if (response.status === 200) {
        const parsed = zAnswerDeleteClosure.safeParse(response.body);
        if (!parsed.success) throw new ProtocolFailure('schema');
        const wire = parsed.data;
        if (wire.state === 'CLOSED_OUTCOME_UNAVAILABLE') {
          return {
            state: 'CLOSED_OUTCOME_UNAVAILABLE',
            ticketId: wire.ticketId,
            operationId: wire.operationId,
            reconciliation: toReconciliation(wire.reconciliation),
          };
        }
        return toAnswerDeleteResult(wire) as AnswerDeleteClosure;
      }
      if (response.status >= 400) throw toDomainFailure(response.body);
      throw new ProtocolFailure('status');
    },

    async prepareAllDataDelete(auth, operationId, timeoutMs) {
      const wire = await send(
        transport,
        {
          method: 'POST',
          path: '/data-deletion-commands',
          bearer: auth.bearer,
          idempotencyKey: operationId,
          body: {},
          timeoutMs,
        },
        [200, 201],
        zAllDataDeleteCommandResult,
      );
      return toAllDataDeleteResult(wire);
    },

    async executeAllDataDelete(auth, ticketId, timeoutMs) {
      const wire = await send(
        transport,
        {
          method: 'PUT',
          path: `/commands/${encodeURIComponent(ticketId)}/execution`,
          bearer: auth.bearer,
          body: { kind: 'ALL_DATA_DELETE' },
          timeoutMs,
        },
        [200, 202],
        zAllDataDeleteCommandResult,
      );
      return toAllDataDeleteResult(wire);
    },

    async getAllDataDeleteResult(auth, ticketId, timeoutMs) {
      const wire = await send(
        transport,
        { method: 'GET', path: `/commands/${encodeURIComponent(ticketId)}`, bearer: auth.bearer, timeoutMs },
        200,
        zAllDataDeleteCommandResult,
      );
      return toAllDataDeleteResult(wire);
    },

    async closeAllDataDelete(auth, ticketId, timeoutMs) {
      const response = await transport({
        method: 'PUT',
        path: `/commands/${encodeURIComponent(ticketId)}/closure`,
        bearer: auth.bearer,
        body: {},
        timeoutMs,
      });
      if (response.status === 202) {
        const parsed = zAllDataDeleteExecuting.safeParse(response.body);
        if (!parsed.success) throw new ProtocolFailure('schema');
        return { state: 'EXECUTING', ticketId: parsed.data.ticketId, operationId: parsed.data.operationId };
      }
      if (response.status === 200) {
        const parsed = zAllDataDeleteClosure.safeParse(response.body);
        if (!parsed.success) throw new ProtocolFailure('schema');
        const wire = parsed.data;
        if (wire.state === 'CLOSED_OUTCOME_UNAVAILABLE') {
          return {
            state: 'CLOSED_OUTCOME_UNAVAILABLE',
            ticketId: wire.ticketId,
            operationId: wire.operationId,
            reconciliation: toReconciliation(wire.reconciliation),
          };
        }
        return toAllDataDeleteResult(wire) as AllDataDeleteClosure;
      }
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
