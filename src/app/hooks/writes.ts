import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { queryKeys } from '../../data/query/keys.ts';
import type { Completion, KeptDraft, WriteView } from '../../domain/commands/answerWriteCoordinator.ts';
import type { PrepareAnswerCreate, Today } from '../../domain/models.ts';
import { useAppServices, useAppSnapshot } from '../services.tsx';

const IDLE: WriteView = { kind: 'idle' };

export interface AnswerWriteHandle {
  view: WriteView;
  save(input: PrepareAnswerCreate, flushKept: () => Promise<KeptDraft | null>): void;
  recheck(): void;
  close(): void;
  consume(): void;
}

export function useAnswerWrite(dailySemaId: string | null): AnswerWriteHandle {
  const { writes } = useAppServices();
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

export function useCompletions() {
  const { completions, platform } = useAppServices();
  return useMemo(
    () => ({
      remember: (completion: Completion) => {
        completions.set(completion.answerId, completion);
        void platform.haptic.memorySaved();
      },
      get: (answerId: string | null) => (answerId ? (completions.get(answerId) ?? null) : null),
    }),
    [completions, platform],
  );
}

export function useCompletionRefresh() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  return useQuery<Today>({
    queryKey: queryKeys.today(session?.ownerScope ?? '', session?.generation ?? '', 'COMPACT'),
    enabled: false,
    queryFn: ({ signal }) => services.session.run('ACTIVE', (auth) => services.api.getToday(auth, 'COMPACT', signal)),
  });
}

export function usePendingWrite(dailySemaId: string | null) {
  const { writes } = useAppServices();
  const [pending, setPending] = useState<{ questionId: string } | null | 'checking'>('checking');
  useEffect(() => {
    if (!dailySemaId) return;
    let active = true;
    writes.unfinished(dailySemaId).then(
      (found) => {
        if (!active) return;
        setPending(found?.kind === 'unresolved' && found.mode === 'CREATE' ? { questionId: found.questionId } : null);
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
