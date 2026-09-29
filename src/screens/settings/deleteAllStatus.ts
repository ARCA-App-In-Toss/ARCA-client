import type { DeletionView } from '../../domain/deletion/allDataDeleteCoordinator.ts';
import { type CopyId, copy } from '../../ui/copy.ts';

type Kind = DeletionView['kind'];

export function isSettledFailure(kind: Kind): boolean {
  return kind === 'notApplied' || kind === 'failed' || kind === 'unsent' || kind === 'blocked';
}

export function closesDialog(kind: Kind): boolean {
  return isSettledFailure(kind) || kind === 'prepared' || kind === 'cleanupFailed';
}

export function pageStatus(view: DeletionView, dialogOpen: boolean): { id: CopyId | null; tone: 'danger' | 'neutral' } {
  switch (view.kind) {
    case 'working':
      return { id: dialogOpen ? null : 'CPY-F31-015', tone: 'neutral' };
    case 'blocked':
      return { id: 'CPY-F31-030', tone: 'danger' };
    case 'unsent':
      return { id: 'CPY-F31-017', tone: 'danger' };
    case 'notApplied':
      return view.code === 'COMMAND_CLOSED'
        ? { id: 'CPY-COM-027', tone: 'neutral' }
        : { id: 'CPY-F31-016', tone: 'danger' };
    case 'failed':
    case 'cleanupFailed':
      return { id: 'CPY-F31-016', tone: 'danger' };
    case 'unconfirmed':
      return { id: dialogOpen ? null : view.recovery ? 'CPY-COM-028' : 'CPY-F31-027', tone: 'neutral' };
    default:
      return { id: null, tone: 'neutral' };
  }
}

export type DeleteDialogAction = 'start' | 'executePrepared' | 'recheck' | 'retryRecovery' | 'close';

export interface DeleteDialogContent {
  status: string | null;
  actionLabel: string;
  cancelLabel: string;
  action: DeleteDialogAction;
}

export function deleteDialogContent(view: DeletionView, recoveryGate: boolean): DeleteDialogContent {
  if (view.kind === 'unconfirmed') {
    if (view.recovery === 'cleanUpExpired') {
      return {
        status: copy['CPY-COM-028'],
        actionLabel: copy['CPY-COM-023'],
        cancelLabel: copy['CPY-F31-028'],
        action: 'close',
      };
    }
    return {
      status: copy['CPY-F31-027'],
      actionLabel: copy['CPY-COM-007'],
      cancelLabel: copy['CPY-F31-028'],
      action: recoveryGate ? 'retryRecovery' : 'recheck',
    };
  }
  return {
    status: view.kind === 'working' ? copy['CPY-F31-015'] : null,
    actionLabel: copy['CPY-F31-014'],
    cancelLabel: copy['CPY-F31-013'],
    action: view.kind === 'prepared' ? 'executePrepared' : 'start',
  };
}

export function openerLabel(view: DeletionView): string {
  if (view.kind === 'unconfirmed') return view.recovery ? copy['CPY-COM-023'] : copy['CPY-F31-029'];
  if (isSettledFailure(view.kind)) return copy['CPY-F31-018'];
  return copy['CPY-F31-010'];
}
