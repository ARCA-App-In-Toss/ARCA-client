import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAppServices, useAppSnapshot } from './services.tsx';

export const paths = {
  start: '/',
  intro: '/intro',
  join: '/join',
  joinComplete: '/join/complete',
  today: '/today',
  write: '/today/write',
  saved: '/today/saved',
  pastDraft: '/today/past-draft',
  archive: '/archive',
  detail: '/archive/detail',
  deleteAnswer: '/archive/detail/delete',
  edit: '/archive/edit',
  settings: '/settings',
  deleteAll: '/settings/delete',
  startError: '/error/start',
} as const;

export type QuestionRole = 'PRIMARY' | 'ALTERNATE';

export interface RouteState {
  routeEpoch: number;
  questionRole?: QuestionRole;
  answerRef?: string;
  draftRef?: string;
  pastDraftEntry?: 'dateChanged' | 'review';
}

function isRouteState(value: unknown): value is RouteState {
  return typeof value === 'object' && value !== null && typeof (value as RouteState).routeEpoch === 'number';
}

export function useRouteState(): RouteState | null {
  const { state } = useLocation();
  const { bootstrap } = useAppSnapshot();
  if (bootstrap.phase !== 'ready' || !isRouteState(state)) return null;
  return state.routeEpoch === bootstrap.routeEpoch ? state : null;
}

let refSeq = 0;

export function useAnswerRefs() {
  const { answerRefs } = useAppServices();
  return useMemo(
    () => ({
      refFor: (answerId: string) => {
        for (const [ref, id] of answerRefs) if (id === answerId) return ref;
        refSeq += 1;
        const ref = globalThis.crypto?.randomUUID?.() ?? `ref-${refSeq}-${Math.random().toString(36).slice(2)}`;
        answerRefs.set(ref, answerId);
        return ref;
      },
      resolve: (ref: string | null | undefined) => (ref ? (answerRefs.get(ref) ?? null) : null),
    }),
    [answerRefs],
  );
}

export function useArcaNavigate() {
  const navigate = useNavigate();
  const { bootstrap } = useAppSnapshot();
  const routeEpoch = bootstrap.phase === 'ready' ? bootstrap.routeEpoch : -1;
  return useCallback(
    (path: string, extra: Omit<RouteState, 'routeEpoch'> = {}, options: { replace?: boolean } = {}) => {
      const state: RouteState = { routeEpoch, ...extra };
      navigate(path, { state, replace: options.replace ?? false });
    },
    [navigate, routeEpoch],
  );
}
