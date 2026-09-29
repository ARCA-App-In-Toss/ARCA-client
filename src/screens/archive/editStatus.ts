import type { DraftLoad } from '../../app/hooks/drafts.ts';
import type { WriteView } from '../../domain/commands/answerWriteCoordinator.ts';
import type { KeepStatus } from '../../domain/drafts/draftWriter.ts';
import { copy } from '../../ui/copy.ts';
import { type CopyResult, copyResultMessage, type KeepState } from '../shared/compose.ts';

export type RebaseState = 'idle' | 'running' | 'failed' | 'unkept';

export interface EditStatusInput {
  view: WriteView;
  loading: boolean;
  keep: KeepState;
  conflict: boolean;
  rebaseState: RebaseState;
  unchanged: boolean;
  edited: boolean;
  load: DraftLoad;
  status: KeepStatus;
  copyResult: CopyResult;
  saveProblem: boolean;
}

export function editStatus(input: EditStatusInput): { message: string | null; danger: boolean } {
  const { view, keep, rebaseState } = input;
  const parts: string[] = [];
  if (input.loading) parts.push(copy['CPY-F22-009']);
  switch (view.kind) {
    case 'working':
      parts.push(view.stage === 'confirming' ? copy['CPY-F22-019'] : copy['CPY-F22-015']);
      break;
    case 'unconfirmed':
      if (view.recovery === 'cleanUpExpired') {
        parts.push(copy['CPY-COM-022']);
        if (keep.failed) parts.push(copy['CPY-F22-012']);
        else if (keep.unsettled) parts.push(copy['CPY-COM-008']);
        break;
      }
      parts.push(copy['CPY-F22-020']);
      if (keep.failed) parts.push(copy['CPY-F22-030']);
      else if (keep.unsettled) parts.push(copy['CPY-COM-008']);
      else if (!view.trackerKept) parts.push(copy['CPY-F11-042']);
      else parts.push(copy['CPY-F22-029']);
      break;
    case 'notApplied':
    case 'rejected':
      if (input.conflict) {
        parts.push(copy['CPY-F22-034']);
        if (rebaseState === 'failed') parts.push(copy['CPY-F21-011']);
        if (rebaseState === 'unkept') parts.push(copy['CPY-COM-008']);
        break;
      }
      parts.push(
        view.kind === 'notApplied' && view.code === 'COMMAND_CLOSED' ? copy['CPY-COM-021'] : copy['CPY-F22-016'],
      );
      if (keep.failed) parts.push(copy['CPY-F22-012']);
      else if (keep.unsettled) parts.push(copy['CPY-COM-008']);
      break;
    case 'localFailure':
      parts.push(copy['CPY-F22-012']);
      break;
    case 'reconciled':
      if (keep.failed) parts.push(copy['CPY-F22-012']);
      break;
    default:
      if (keep.failed) parts.push(copy['CPY-F22-012']);
      else if (input.unchanged && input.edited) parts.push(copy['CPY-F22-013']);
      else if (
        input.load.kind === 'ready' &&
        input.load.restored &&
        !input.unchanged &&
        input.status.kind === 'clean'
      ) {
        parts.push(copy['CPY-F22-011']);
      }
  }
  const copied = copyResultMessage(input.copyResult);
  if (copied) parts.push(copied);
  return {
    message: parts.length > 0 ? parts.join(' ') : null,
    danger:
      (input.saveProblem && !input.conflict) ||
      rebaseState === 'failed' ||
      rebaseState === 'unkept' ||
      keep.failed ||
      input.copyResult === 'failed' ||
      view.kind === 'localFailure',
  };
}
