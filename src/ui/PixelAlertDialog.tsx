import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { ReactNode, RefObject } from 'react';

// CMP-017 PixelAlertDialog: the only place Radix AlertDialog is used (06 §10.1). The wrapper owns
// labelling, modal isolation, focus trap, the safe initial focus and the dismiss rules of 04 IX-015/016:
// outside taps never close it, Escape/Back mean the safe cancel, and a running mutation locks dismissal.

export interface PixelAlertDialogProps {
  open: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  actionLabel: string;
  /** Safe action; also Escape/Back. */
  onCancel(): void;
  /** Risky action. The caller decides when to close; a Promise never auto-closes the dialog. */
  onAction(): void;
  /** Mutation running or unresolved: Escape/Back and cancel are locked. */
  locked?: boolean;
  /** The risky action itself is running (loading, no repeat); defaults to `locked`. */
  busy?: boolean;
  /** Focus returns here on close (the control that opened it). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Extra confirmation context after the description (e.g. the F23 target date and question). */
  children?: ReactNode;
  /** In-dialog progress/result status; the dialog's single polite source while open. */
  status?: string | null;
  /** Destructive confirmation: danger role, never the primary colour (02 §9.3). */
  danger?: boolean;
}

export function PixelAlertDialog({
  open,
  title,
  description,
  cancelLabel,
  actionLabel,
  onCancel,
  onAction,
  locked = false,
  busy = locked,
  returnFocusRef,
  children,
  status = null,
  danger = false,
}: PixelAlertDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !locked) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="arca-dimmer" />
        <AlertDialog.Content
          className="arca-alert-dialog"
          onEscapeKeyDown={(event) => {
            if (locked) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocusRef?.current) {
              event.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
        >
          <AlertDialog.Title className="arca-screen-title">{title}</AlertDialog.Title>
          <AlertDialog.Description className="arca-user-text">{description}</AlertDialog.Description>
          {children}
          <div role="status" aria-live="polite" className="arca-inline-status">
            {status}
          </div>
          <div className="arca-actions">
            {/* Radix focuses Cancel first: the safe action is the initial focus (04 IX-015). */}
            <AlertDialog.Cancel asChild>
              <button type="button" className="arca-button arca-button--secondary" disabled={locked}>
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className={danger ? 'arca-button arca-button--danger' : 'arca-button arca-button--ghost'}
              aria-busy={busy || undefined}
              onClick={() => {
                if (!busy) onAction();
              }}
            >
              {actionLabel}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
