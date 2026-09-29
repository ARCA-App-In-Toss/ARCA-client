import * as Dialog from '@radix-ui/react-dialog';
import { type ReactNode, type RefObject, useEffect } from 'react';
import { useBlocker } from 'react-router';

export interface PixelSheetProps {
  open: boolean;
  title: string;
  description: string;
  closeLabel: string;
  onClose(): void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function PixelSheet({
  open,
  title,
  description,
  closeLabel,
  onClose,
  returnFocusRef,
  children,
}: PixelSheetProps) {
  const blocker = useBlocker(open);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    blocker.reset();
    onClose();
  }, [blocker, onClose]);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="arca-dimmer" />
        <Dialog.Content
          className="arca-sheet arca-px"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            if (returnFocusRef?.current) {
              event.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
        >
          <Dialog.Title className="arca-screen-title">{title}</Dialog.Title>
          <Dialog.Description className="arca-text-secondary">{description}</Dialog.Description>
          {children}
          <Dialog.Close asChild>
            <button type="button" className="arca-button arca-button--secondary arca-px">
              {closeLabel}
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
