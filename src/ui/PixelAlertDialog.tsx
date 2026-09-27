import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { RefObject } from 'react';

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
  /** Mutation running: Escape/Back and cancel are locked. */
  locked?: boolean;
  /** Focus returns here on close (the control that opened it). */
  returnFocusRef?: RefObject<HTMLElement | null>;
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
  returnFocusRef,
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
          <div className="arca-actions">
            {/* Radix focuses Cancel first: the safe action is the initial focus (04 IX-015). */}
            <AlertDialog.Cancel asChild>
              <button type="button" className="arca-button arca-button--secondary" disabled={locked}>
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className="arca-button arca-button--ghost"
              aria-busy={locked || undefined}
              onClick={() => {
                if (!locked) onAction();
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
