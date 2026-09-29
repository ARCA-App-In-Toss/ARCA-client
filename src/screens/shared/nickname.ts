import { type ChangeEvent, type CompositionEvent, type KeyboardEvent, useRef, useState } from 'react';
import type { NicknameSaveOutcome } from '../../app/hooks/passenger.ts';
import { countGraphemes } from '../../domain/text/graphemes.ts';
import { checkNickname } from '../../domain/text/nickname.ts';
import type { CopyId } from '../../ui/copy.ts';

export function useNicknameInput(onCommit?: () => void) {
  const [value, setValue] = useState('');
  const [committed, setCommitted] = useState('');
  const composingRef = useRef(false);
  const [shortRevealed, setShortRevealed] = useState(false);
  const check = checkNickname(committed);
  const visibleError = check.error === 'too-short' && !shortRevealed ? null : check.error;

  const commit = (next: string) => {
    setCommitted(next);
    onCommit?.();
  };

  return {
    value,
    check,
    visibleError,
    currentCount: countGraphemes(value.trim()),
    composingRef,
    replace: (next: string) => {
      setValue(next);
      setCommitted(next);
    },
    setShortRevealed,
    fieldHandlers: (onEnter: () => void) => ({
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        setValue(event.target.value);
        if (!composingRef.current) commit(event.target.value);
      },
      onCompositionStart: () => {
        composingRef.current = true;
      },
      onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => {
        composingRef.current = false;
        commit(event.currentTarget.value);
      },
      onBlur: () => {
        if (checkNickname(value).error === 'too-short') setShortRevealed(true);
      },
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing || composingRef.current) return;
        event.preventDefault();
        onEnter();
      },
    }),
  };
}

export interface NicknameProblem {
  id: CopyId;
  tone: 'danger' | 'neutral';
  failed: boolean;
}

export function nicknameProblem(
  result: Exclude<NicknameSaveOutcome, { kind: 'saved' }>,
  failures: { unsent: CopyId; rejected: CopyId },
): NicknameProblem {
  if (result.kind === 'unsent') return { id: failures.unsent, tone: 'danger', failed: true };
  if (result.kind === 'rejected') return { id: failures.rejected, tone: 'danger', failed: true };
  return { id: 'CPY-F11-044', tone: 'neutral', failed: false };
}
