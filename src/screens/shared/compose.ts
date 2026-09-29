import { type ChangeEvent, type CompositionEvent, useRef, useState } from 'react';
import type { DraftSession } from '../../app/hooks/drafts.ts';
import type { KeepStatus } from '../../domain/drafts/draftWriter.ts';
import { countGraphemes, measureAnswer } from '../../domain/text/graphemes.ts';
import { copy } from '../../ui/copy.ts';

export type CopyResult = 'copied' | 'failed' | null;

export function copyResultMessage(result: CopyResult): string | null {
  if (result === 'copied') return copy['CPY-F13-014'];
  if (result === 'failed') return copy['CPY-F13-015'];
  return null;
}

export interface KeepLabels {
  saving: string;
  kept: string;
  failed: string;
}

export function keepLabel(status: KeepStatus, labels: KeepLabels): string | null {
  switch (status.kind) {
    case 'persisting':
    case 'editing':
      return labels.saving;
    case 'persisted':
      return labels.kept;
    case 'failed':
      return labels.failed;
    case 'clean':
      return null;
  }
}

export interface KeepState {
  failed: boolean;
  unsettled: boolean;
}

export function keepStateOf(draft: Pick<DraftSession, 'load' | 'status'>): KeepState {
  return {
    failed: draft.load.kind === 'unreadable' || draft.status.kind === 'failed',
    unsettled: draft.status.kind === 'persisting' || draft.status.kind === 'editing',
  };
}

export function useAnswerInput(draft: Pick<DraftSession, 'text' | 'change' | 'compositionEnd'>, onEdit?: () => void) {
  const composingRef = useRef(false);
  const [settledText, setSettledText] = useState<string | null>(null);
  const measured = measureAnswer(settledText ?? draft.text);
  const currentCount = settledText === null ? measured.count : countGraphemes(draft.text);

  return {
    composingRef,
    composing: settledText !== null,
    measured,
    currentCount,
    resetComposition: () => setSettledText(null),
    fieldHandlers: {
      onCompositionStart: () => {
        composingRef.current = true;
        setSettledText(draft.text);
      },
      onCompositionEnd: (event: CompositionEvent<HTMLTextAreaElement>) => {
        composingRef.current = false;
        setSettledText(null);
        draft.compositionEnd(event.currentTarget.value);
      },
      onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
        onEdit?.();
        draft.change(event.currentTarget.value, composingRef.current);
      },
    },
  };
}
