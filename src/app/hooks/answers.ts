import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { KeptDraft, WriteView } from '../../domain/commands/answerWriteCoordinator.ts';
import type { PrepareAnswerUpdate } from '../../domain/models.ts';
import { useAppServices } from '../services.tsx';

const IDLE: WriteView = { kind: 'idle' };

export interface AnswerCommandHandle {
  view: WriteView;
  saveEdit(input: PrepareAnswerUpdate, flushKept: () => Promise<KeptDraft | null>): void;
  remove(expectedRevision: string): void;
  recheck(): void;
  close(): void;
  consume(): void;
}

export function useAnswerCommand(answerId: string | null): AnswerCommandHandle {
  const { answers } = useAppServices();
  const subscribe = useCallback(
    (listener: () => void) => (answerId ? answers.subscribe(answerId, listener) : () => undefined),
    [answers, answerId],
  );
  const getView = useCallback(() => (answerId ? answers.getView(answerId) : IDLE), [answers, answerId]);
  const view = useSyncExternalStore(subscribe, getView, getView);
  const actions = useMemo(
    () => ({
      saveEdit: (input: PrepareAnswerUpdate, flushKept: () => Promise<KeptDraft | null>) => {
        void answers.save({ input, flushDraft: flushKept });
      },
      remove: (expectedRevision: string) => {
        if (answerId) void answers.delete({ input: { answerId, expectedRevision } });
      },
      recheck: () => {
        if (answerId) void answers.recheck(answerId);
      },
      close: () => {
        if (answerId) void answers.close(answerId);
      },
      consume: () => {
        if (answerId) answers.acknowledgeView(answerId);
      },
    }),
    [answers, answerId],
  );
  return useMemo(() => ({ view, ...actions }), [view, actions]);
}

export type PendingAnswer = 'checking' | { mode: 'UPDATE' | 'DELETE' } | null;

export function usePendingAnswer(answerId: string | null): PendingAnswer {
  const { answers } = useAppServices();
  const [pending, setPending] = useState<PendingAnswer>('checking');
  useEffect(() => {
    if (!answerId) return;
    let active = true;
    const read = () =>
      answers.unfinished(answerId).then(
        (found) => {
          if (active) setPending(found?.kind === 'unresolved' && found.mode !== 'CREATE' ? { mode: found.mode } : null);
          return found;
        },
        () => {
          if (active) setPending(null);
          return null;
        },
      );
    void read().then((found) => {
      if (!active || !found) return;
      void answers
        .recheck(answerId, { quiet: found.kind === 'finishing' })
        .catch(() => undefined)
        .then(() => (active ? read() : null));
    });
    return () => {
      active = false;
    };
  }, [answers, answerId]);
  return pending;
}
