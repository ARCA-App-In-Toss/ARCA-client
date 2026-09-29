import type { WriteView } from '../../domain/commands/answerWriteCoordinator.ts';
import { copy } from '../../ui/copy.ts';

export type Notice = 'editSaved' | 'editNotSaved' | 'deleteFailed' | 'deleteClosed' | null;

export interface DetailStatusInput {
  editUnresolved: boolean;
  deleteUnresolved: boolean;
  notice: Notice;
}

export function detailStatus(input: DetailStatusInput): { message: string | null; danger: boolean } {
  const { notice } = input;
  return {
    message: detailMessage(input),
    danger: notice === 'deleteFailed' || notice === 'editNotSaved',
  };
}

function detailMessage({ editUnresolved, deleteUnresolved, notice }: DetailStatusInput): string | null {
  if (editUnresolved) return copy['CPY-F21-017'];
  if (deleteUnresolved) return copy['CPY-F21-019'];
  switch (notice) {
    case 'editSaved':
      return copy['CPY-F21-014'];
    case 'editNotSaved':
      return copy['CPY-F22-032'];
    case 'deleteFailed':
      return copy['CPY-F21-015'];
    case 'deleteClosed':
      return copy['CPY-COM-027'];
    case null:
      return null;
  }
}

export function deleteDialogState(
  view: WriteView,
  deleteRunning: boolean,
): { status: string | null; actionLabel: string } {
  const initial = { status: null, actionLabel: copy['CPY-F23-007'] };
  if (!deleteRunning) return initial;
  if (view.kind === 'working') return { ...initial, status: copy['CPY-F23-008'] };
  if (view.kind !== 'unconfirmed') return initial;
  switch (view.recovery) {
    case 'cleanUpExpired':
      return { status: copy['CPY-COM-028'], actionLabel: copy['CPY-COM-023'] };
    case 'closePrepared':
      return { status: null, actionLabel: copy['CPY-COM-026'] };
    default:
      return { status: copy['CPY-F23-011'], actionLabel: copy['CPY-COM-007'] };
  }
}
