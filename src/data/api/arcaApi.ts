import type { z } from 'zod';
import { ProtocolFailure, TransportFailure } from '../failures.ts';
import { toDomainFailure } from './errorEnvelope.ts';
import { zEstablishSessionResponse, zTodayReadModel } from './generated/zod.gen.ts';
import type { EstablishedSession, ExcerptProfile, SessionContext, Today } from './models.ts';
import type { HttpRequest, HttpTransport } from './transport.ts';

/** Safe query transport budget and single connectivity retry (06 §6.2). */
export const SAFE_QUERY_TIMEOUT_MS = 8_000;
const SESSION_TIMEOUT_MS = 8_000;

export interface Bearer {
  readonly bearer: string;
}

export interface ArcaApi {
  /** OP-001. Creates no passenger. */
  establishSession(anonymousKey: string): Promise<EstablishedSession>;
  /** OP-005. */
  getToday(auth: Bearer, excerptProfile: ExcerptProfile, signal?: AbortSignal): Promise<Today>;
}

async function send<S extends z.ZodType>(
  transport: HttpTransport,
  request: HttpRequest,
  expectedStatus: number,
  schema: S,
): Promise<z.output<S>> {
  const response = await transport(request);
  if (response.status === expectedStatus) {
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
  };
}
