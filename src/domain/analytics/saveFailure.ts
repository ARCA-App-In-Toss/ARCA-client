import type { WriteView } from '../commands/answerWriteCoordinator.ts';
import type { SaveFailureCertainty, SaveFailureReason } from './productEvent.ts';

const REASON_BY_CODE: Readonly<Record<string, SaveFailureReason>> = {
  ANSWER_CONTENT_INVALID: 'VALIDATION_REJECTED',
  COMMAND_PAYLOAD_MISMATCH: 'VALIDATION_REJECTED',
  INVALID_REQUEST: 'VALIDATION_REJECTED',
  DATE_CHANGED: 'DATE_CHANGED',
  SEMA_REPLACED: 'CONTENT_REPLACED',
  REVISION_CONFLICT: 'CONFLICT',
  ANSWER_ALREADY_EXISTS: 'CONFLICT',
  ANSWER_NOT_FOUND: 'CONFLICT',
  COMMAND_ALREADY_PENDING: 'CONFLICT',
  IDEMPOTENCY_KEY_REUSED: 'CONFLICT',
  RATE_LIMITED: 'SERVER_UNAVAILABLE',
  MAINTENANCE: 'SERVER_UNAVAILABLE',
  INTERNAL_ERROR: 'SERVER_UNAVAILABLE',
  COMMAND_CLOSED: 'COMMAND_CLOSED',
  COMMAND_EXPIRED: 'COMMAND_EXPIRED',
};

export interface SaveFailure {
  certainty: SaveFailureCertainty;
  reasonCode: SaveFailureReason;
}

export function saveFailureOf(view: WriteView): SaveFailure | null {
  switch (view.kind) {
    case 'unconfirmed':
      return { certainty: 'UNKNOWN', reasonCode: 'NETWORK_UNCONFIRMED' };
    case 'notApplied':
    case 'rejected':
      return { certainty: 'NOT_APPLIED', reasonCode: REASON_BY_CODE[view.code] ?? 'VALIDATION_REJECTED' };
    default:
      return null;
  }
}
