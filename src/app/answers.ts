import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { PrepareAnswerUpdate } from '../data/api/models.ts';
import type { KeptDraft, WriteView } from '../domain/commands/answerWriteCoordinator.ts';
import { useAppServicesInternal } from './AppServices.tsx';

// F21~F23 command handles (06 §3.2, §9.2). The answer family has one lock per answer: an edit and a
// delete of the same answer never run side by side (06 §4.3).

const IDLE: WriteView = { kind: 'idle' };

export interface AnswerCommandHandle {
  view: WriteView;
  saveEdit(input: PrepareAnswerUpdate, flushKept: () => Promise<KeptDraft | null>): void;
  remove(expectedRevision: string): void;
  recheck(): void;
  /** Explicit OP-015 close/cleanup (04 IX-041); never called by a timer or an exit. */
  close(): void;
  consume(): void;
}

export function useAnswerCommand(answerId: string | null): AnswerCommandHandle {
  const { answers } = useAppServicesInternal();
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

/**
 * Unresolved edit/delete of this answer. Entering F21/F22 checks it once through the same
 * single-flight command; the server's result comes before plain reading (04 IX-036 #5).
 */
export function usePendingAnswer(answerId: string | null): PendingAnswer {
  const { answers } = useAppServicesInternal();
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
      // One check; afterwards the kept tracker (or its absence) is read again.
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
