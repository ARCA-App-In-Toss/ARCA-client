import type { ZodObject } from 'zod';
import { DomainFailure, ProtocolFailure } from '../../domain/failures.ts';
import { zApiError } from './generated/zod.gen.ts';

const optionsByCode = new Map<string, ZodObject>();
for (const option of zApiError.options as readonly ZodObject[]) {
  const code = (option.shape.code as { value?: unknown } | undefined)?.value;
  if (typeof code === 'string') optionsByCode.set(code, option);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toDomainFailure(body: unknown): DomainFailure | ProtocolFailure {
  if (!isRecord(body) || !isRecord(body.error)) return new ProtocolFailure('envelope');
  const raw = body.error;
  const option = typeof raw.code === 'string' ? optionsByCode.get(raw.code) : undefined;
  if (!option) return new ProtocolFailure('envelope');
  if ('recovery' in raw && !('recovery' in option.shape)) return new ProtocolFailure('envelope');

  const known = Object.fromEntries(Object.keys(option.shape).flatMap((key) => (key in raw ? [[key, raw[key]]] : [])));
  const parsed = option.safeParse(known);
  if (!parsed.success) return new ProtocolFailure('envelope');

  const error = parsed.data as { code: string; category: DomainFailure['category']; requestId: string };
  const recovery = (parsed.data as { recovery?: { recoveryAllowed?: unknown } }).recovery;
  return new DomainFailure(error.code, error.category, error.requestId, recovery?.recoveryAllowed === true);
}
