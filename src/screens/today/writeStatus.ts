import type { WriteView } from '../../domain/commands/answerWriteCoordinator.ts';
import { copy } from '../../ui/copy.ts';
import { type CopyResult, copyResultMessage, type KeepState } from '../shared/compose.ts';

export interface WriteStatusInput {
  view: WriteView;
  loading: boolean;
  semaStopped: boolean;
  keep: KeepState;
  switchBlocked: boolean;
  restoredClean: boolean;
  announcement: string | null;
  copyResult: CopyResult;
  saveProblem: boolean;
}

export function writeStatus(input: WriteStatusInput): { message: string | null; danger: boolean } {
  const { view, keep } = input;
  const parts: string[] = [];
  if (input.loading) parts.push(copy['CPY-F11-009']);
  if (input.semaStopped) {
    if (keep.failed) parts.push(copy['CPY-F11-034']);
    else if (keep.unsettled) parts.push(copy['CPY-F11-020'], copy['CPY-COM-008']);
    else parts.push(copy['CPY-F11-033']);
  } else {
    switch (view.kind) {
      case 'working':
        parts.push(view.stage === 'confirming' ? copy['CPY-F11-024'] : copy['CPY-F11-019']);
        break;
      case 'unconfirmed':
        if (view.recovery === 'cleanUpExpired') {
          parts.push(copy['CPY-COM-022']);
          if (keep.failed) parts.push(copy['CPY-F11-013']);
          else if (keep.unsettled) parts.push(copy['CPY-COM-008']);
          break;
        }
        if (keep.failed) parts.push(copy['CPY-F11-027']);
        else if (keep.unsettled) parts.push(copy['CPY-F11-044'], copy['CPY-COM-008']);
        else if (!view.trackerKept) parts.push(copy['CPY-F11-042']);
        else parts.push(copy['CPY-F11-026']);
        break;
      case 'notApplied':
      case 'rejected':
        parts.push(
          view.kind === 'notApplied' && view.code === 'COMMAND_CLOSED' ? copy['CPY-COM-021'] : copy['CPY-F11-020'],
        );
        if (keep.failed) parts.push(copy['CPY-F11-013']);
        else if (keep.unsettled) parts.push(copy['CPY-COM-008']);
        break;
      case 'localFailure':
        parts.push(copy['CPY-F11-013']);
        break;
      case 'reconciled':
        if (view.reconciliation.nextAction === 'CREATE_CURRENT_DAY') parts.push(copy['CPY-COM-025']);
        if (keep.failed) parts.push(copy['CPY-F11-013']);
        break;
      default:
        if (input.switchBlocked) parts.push(copy['CPY-F11-017']);
        else if (keep.failed) parts.push(copy['CPY-F11-013']);
        else if (input.restoredClean) parts.push(copy['CPY-F11-012']);
        else if (input.announcement) parts.push(input.announcement);
    }
  }
  const copied = copyResultMessage(input.copyResult);
  if (copied) parts.push(copied);
  return {
    message: parts.length > 0 ? parts.join(' ') : null,
    danger: input.saveProblem || keep.failed || input.copyResult === 'failed' || parts.includes(copy['CPY-F11-027']),
  };
}
