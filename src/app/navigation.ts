import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAppServicesInternal, useAppSnapshot } from './AppServices.tsx';

// history.state carries only an opaque ref and the local routeEpoch (06 §5.1, §5.5). No content,
// nickname, token, ticket or server id ever goes into the URL.

export const paths = {
  start: '/',
  intro: '/intro',
  join: '/join',
  joinComplete: '/join/complete',
  today: '/today',
  write: '/today/write',
  saved: '/today/saved',
  archive: '/archive',
  detail: '/archive/detail',
  startError: '/error/start',
} as const;

export type QuestionRole = 'PRIMARY' | 'ALTERNATE';

export interface RouteState {
  routeEpoch: number;
  questionRole?: QuestionRole;
  answerRef?: string;
}

function isRouteState(value: unknown): value is RouteState {
  return typeof value === 'object' && value !== null && typeof (value as RouteState).routeEpoch === 'number';
}

/** The current entry's state, or null if it is missing or from an older route epoch (06 §5.5). */
export function useRouteState(): RouteState | null {
  const { state } = useLocation();
  const { bootstrap } = useAppSnapshot();
  if (bootstrap.phase !== 'ready' || !isRouteState(state)) return null;
  return state.routeEpoch === bootstrap.routeEpoch ? state : null;
}

let refSeq = 0;

/**
 * Opaque answer refs for history.state: a random local ref maps to the answer id in memory only, so
 * history never stores a server id (06 §5.1). A reload or owner change drops the map, and the screen
 * then returns to its parent.
 */
export function useAnswerRefs() {
  const { answerRefs } = useAppServicesInternal();
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
