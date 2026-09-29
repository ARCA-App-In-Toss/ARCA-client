import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { copy } from '../../ui/copy.ts';
import { PixelAlertDialog } from '../../ui/PixelAlertDialog.tsx';

export const LEAVE_KEEP_WAIT_MS = 2_000;

export function withinMs<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export interface LeaveGuardOptions {
  shouldBlock: () => boolean;
  pending: boolean;
  flush: () => Promise<boolean>;
}

export interface LeaveGuard {
  allowLeave(): void;
  dialog: { open: boolean; onCancel(): void; onAction(): void };
}

export function useLeaveGuard({ shouldBlock, pending, flush }: LeaveGuardOptions): LeaveGuard {
  const allowRef = useRef(false);
  const [open, setOpen] = useState(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowRef.current || currentLocation.pathname === nextLocation.pathname) return false;
    return shouldBlock();
  });
  const latest = useRef({ pending, flush, blocker });
  latest.current = { pending, flush, blocker };
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (latest.current.pending) {
      latest.current.blocker.reset?.();
      return;
    }
    let active = true;
    void withinMs(latest.current.flush(), LEAVE_KEEP_WAIT_MS, false).then((kept) => {
      const current = latest.current.blocker;
      if (!active || current.state !== 'blocked') return;
      if (kept) current.proceed();
      else setOpen(true);
    });
    return () => {
      active = false;
    };
  }, [blocker.state]);

  const allowLeave = useCallback(() => {
    allowRef.current = true;
  }, []);

  return {
    allowLeave,
    dialog: {
      open,
      onCancel: () => {
        setOpen(false);
        if (blocker.state === 'blocked') blocker.reset();
      },
      onAction: () => {
        setOpen(false);
        if (blocker.state === 'blocked') blocker.proceed();
      },
    },
  };
}

export function LeaveConfirmDialog({
  guard,
  returnFocusRef,
}: {
  guard: LeaveGuard;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <PixelAlertDialog
      open={guard.dialog.open}
      title={copy['CPY-F11-036']}
      description={copy['CPY-F11-037']}
      cancelLabel={copy['CPY-F11-038']}
      actionLabel={copy['CPY-F11-039']}
      returnFocusRef={returnFocusRef}
      onCancel={guard.dialog.onCancel}
      onAction={guard.dialog.onAction}
    />
  );
}
