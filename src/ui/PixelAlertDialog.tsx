import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { ReactNode, RefObject } from 'react';
import { usePendingReveal } from './pendingReveal.ts';

export interface PixelAlertDialogProps {
  open: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  actionLabel: string;
  onCancel(): void;
  onAction(): void;
  locked?: boolean;
  busy?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children?: ReactNode;
  status?: string | null;
  danger?: boolean;
  pairActions?: boolean;
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
  pairActions = false,
}: PixelAlertDialogProps) {
  const busyShown = usePendingReveal(busy);
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
          className={danger ? 'arca-alert-dialog arca-px' : 'arca-alert-dialog arca-alert-dialog--neutral arca-px'}
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
            {busy && !busyShown ? null : status}
          </div>
          <div className={pairActions ? 'arca-actions arca-actions--pair' : 'arca-actions'}>
            <AlertDialog.Cancel asChild>
              <button type="button" className="arca-button arca-button--secondary arca-px" disabled={locked}>
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className={danger ? 'arca-button arca-button--danger arca-px' : 'arca-button arca-button--ghost'}
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
