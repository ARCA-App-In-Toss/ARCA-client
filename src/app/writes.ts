import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { PrepareAnswerCreate, Today } from '../data/api/models.ts';
import { queryKeys } from '../data/query/keys.ts';
import type { Completion, KeptDraft, WriteView } from '../domain/commands/answerWriteCoordinator.ts';
import { useAppServicesInternal, useAppSnapshot } from './AppServices.tsx';

const IDLE: WriteView = { kind: 'idle' };

export interface AnswerWriteHandle {
  view: WriteView;
  save(input: PrepareAnswerCreate, flushKept: () => Promise<KeptDraft | null>): void;
  recheck(): void;
  /** The user's explicit close of a request this device can no longer execute (04 IX-041). */
  close(): void;
  /** Screen consumed a settled view (success navigation, error shown and dismissed). */
  consume(): void;
}

/** The answer-write command for today's daily SEMA, owned by CommandCoordinator (06 §3.2). */
export function useAnswerWrite(dailySemaId: string | null): AnswerWriteHandle {
  const { writes } = useAppServicesInternal();
  const subscribe = useCallback(
    (listener: () => void) => (dailySemaId ? writes.subscribe(dailySemaId, listener) : () => undefined),
    [writes, dailySemaId],
  );
  const getView = useCallback(() => (dailySemaId ? writes.getView(dailySemaId) : IDLE), [writes, dailySemaId]);
  const view = useSyncExternalStore(subscribe, getView, getView);

  const actions = useMemo(
    () => ({
      save: (input: PrepareAnswerCreate, flushKept: () => Promise<KeptDraft | null>) => {
        void writes.save({ input, flushDraft: flushKept });
      },
      recheck: () => {
        if (dailySemaId) void writes.recheck(dailySemaId);
      },
      close: () => {
        if (dailySemaId) void writes.close(dailySemaId);
      },
      consume: () => {
        if (dailySemaId) writes.acknowledgeView(dailySemaId);
      },
    }),
    [writes, dailySemaId],
  );
  return useMemo(() => ({ view, ...actions }), [view, actions]);
}

/** F12's completion model: memory only, cleared with other private memory on owner change (06 §5.1). */
export function useCompletions() {
  const { completions, platform } = useAppServicesInternal();
  return useMemo(
    () => ({
      /** Stores the model and fires the one first-save haptic, best-effort (03 §5.3, 06 §8.7). */
      remember: (completion: Completion) => {
        completions.set(completion.answerId, completion);
        void platform.haptic.memorySaved();
      },
      get: (answerId: string | null) => (answerId ? (completions.get(answerId) ?? null) : null),
    }),
    [completions, platform],
  );
}

/**
 * F12 information re-query (CPY-F12-018): OP-005 with the completion excerpt profile. Runs only when
 * the user asks; it never re-runs the save (04 IX-039).
 */
export function useCompletionRefresh() {
  const services = useAppServicesInternal();
  const { session } = useAppSnapshot();
  return useQuery<Today>({
    queryKey: queryKeys.today(session?.ownerScope ?? '', session?.generation ?? '', 'COMPACT'),
    enabled: false,
    queryFn: ({ signal }) => services.session.run('ACTIVE', (auth) => services.api.getToday(auth, 'COMPACT', signal)),
  });
}

export function useCopyText() {
  const { platform } = useAppServicesInternal();
  return (text: string) => platform.clipboard.writeText(text);
}

/**
 * Unresolved save for today's daily SEMA. Entering a screen checks it once through the same
 * single-flight command; there is no background polling (06 §8.5 #6).
 */
export function usePendingWrite(dailySemaId: string | null) {
  const { writes } = useAppServicesInternal();
  const [pending, setPending] = useState<{ questionId: string } | null | 'checking'>('checking');
  useEffect(() => {
    if (!dailySemaId) return;
    let active = true;
    writes.unfinished(dailySemaId).then(
      (found) => {
        if (!active) return;
        setPending(found?.kind === 'unresolved' && found.mode === 'CREATE' ? { questionId: found.questionId } : null);
        // Unresolved: confirm once. Finishing interrupted by termination: resume quietly (06 §8.7).
        if (found) void writes.recheck(dailySemaId, { quiet: found.kind === 'finishing' });
      },
      () => {
        if (active) setPending(null);
      },
    );
    return () => {
      active = false;
    };
  }, [writes, dailySemaId]);
  return pending;
}
