import { ProtocolFailure, TransportFailure } from '../../domain/failures.ts';

export type HttpMethod = 'GET' | 'POST' | 'PUT';

export interface HttpRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, string>;
  bearer?: string;
  idempotencyKey?: string;
  body?: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

export interface HttpTransportConfig {
  baseUrl: string | undefined;
  fetch?: typeof fetch;
}

export function createHttpTransport({ baseUrl, fetch: fetchImpl = fetch }: HttpTransportConfig): HttpTransport {
  return async (request) => {
    if (!baseUrl) throw new TransportFailure('not-configured');

    const url = new URL(`${baseUrl.replace(/\/$/, '')}/v1${request.path}`);
    for (const [name, value] of Object.entries(request.query ?? {})) url.searchParams.set(name, value);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (request.body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
    if (request.bearer) headers.Authorization = `Bearer ${request.bearer}`;
    if (request.idempotencyKey) headers['Idempotency-Key'] = request.idempotencyKey;

    if (request.signal?.aborted) throw new TransportFailure('aborted');

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, request.timeoutMs);
    const forwardAbort = () => controller.abort();
    request.signal?.addEventListener('abort', forwardAbort, { once: true });

    let status: number;
    let text: string;
    try {
      const init: RequestInit = {
        method: request.method,
        headers,
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      };
      if (request.body !== undefined) init.body = JSON.stringify(request.body);
      const response = await fetchImpl(url, init);
      status = response.status;
      text = await response.text();
    } catch {
      throw new TransportFailure(timedOut ? 'timeout' : request.signal?.aborted ? 'aborted' : 'network');
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', forwardAbort);
    }

    if (text.length === 0) return { status, body: undefined };
    try {
      return { status, body: JSON.parse(text) as unknown };
    } catch {
      throw new ProtocolFailure('json');
    }
  };
}
