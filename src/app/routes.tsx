import type { ReactNode } from 'react';
import { Navigate, Outlet, type RouteObject, useLocation } from 'react-router';
import type { SessionMode } from '../data/api/models.ts';
import { AnswerDetailScreen } from '../screens/archive/AnswerDetailScreen.tsx';
import { ArchiveScreen } from '../screens/archive/ArchiveScreen.tsx';
import { StartErrorScreen } from '../screens/error/StartErrorScreen.tsx';
import { BoardedScreen } from '../screens/onboarding/BoardedScreen.tsx';
import { BoardingScreen } from '../screens/onboarding/BoardingScreen.tsx';
import { IntroScreen } from '../screens/onboarding/IntroScreen.tsx';
import { PastDraftScreen } from '../screens/today/PastDraftScreen.tsx';
import { SavedScreen } from '../screens/today/SavedScreen.tsx';
import { TodayScreen } from '../screens/today/TodayScreen.tsx';
import { WriteScreen } from '../screens/today/WriteScreen.tsx';
import { useAppSnapshot } from './AppServices.tsx';
import { StartScreen } from './bootstrap/StartScreen.tsx';
import { paths } from './navigation.ts';

// Route table (06 §5.1). URLs and history state carry no IDs, tokens, nicknames or content.
export { paths };

const targetPath = { intro: paths.intro, today: paths.today, boarded: paths.joinComplete } as const;

/**
 * F00 is also the boundary in front of every route: a cold start on any URL shows F00 until
 * session, generation and local area are confirmed (06 §5.1, §5.3).
 */
function BootstrapBoundary() {
  const { bootstrap } = useAppSnapshot();
  const { pathname } = useLocation();

  if (bootstrap.phase === 'starting') return <StartScreen />;
  if (bootstrap.phase === 'failed') {
    return pathname === paths.startError ? <Outlet /> : <Navigate to={paths.startError} replace />;
  }
  if (pathname === paths.startError || pathname === paths.start) {
    return <Navigate to={targetPath[bootstrap.target]} replace />;
  }
  return <Outlet />;
}

/**
 * Invalid route for the current mode goes back to the confirmed root with replace (06 §5.3 #8).
 * It never redirects to itself: an inconsistent snapshot shows F00 instead of looping.
 */
function RequireMode({ mode, children }: { mode: SessionMode; children: ReactNode }) {
  const { bootstrap, session } = useAppSnapshot();
  const { pathname } = useLocation();
  if (session?.mode === mode) return <>{children}</>;
  const fallback = bootstrap.phase === 'ready' ? targetPath[bootstrap.target] : paths.start;
  if (fallback === pathname) return <StartScreen />;
  return <Navigate to={fallback} replace />;
}

/** F03 exists only for this visit's OP-003 handoff; any other entry goes to the confirmed root (06 §5.1). */
function RequireBoarding({ children }: { children: ReactNode }) {
  const { bootstrap, session } = useAppSnapshot();
  if (session?.mode === 'ACTIVE' && bootstrap.phase === 'ready' && bootstrap.target === 'boarded') {
    return <>{children}</>;
  }
  return <Navigate to={bootstrap.phase === 'ready' ? targetPath[bootstrap.target] : paths.start} replace />;
}

export const routes: RouteObject[] = [
  {
    element: <BootstrapBoundary />,
    children: [
      { path: paths.start, element: null },
      {
        path: paths.intro,
        element: (
          <RequireMode mode="PRE_PASSENGER">
            <IntroScreen />
          </RequireMode>
        ),
      },
      {
        path: paths.join,
        element: (
          <RequireMode mode="PRE_PASSENGER">
            <BoardingScreen />
          </RequireMode>
        ),
      },
      {
        path: paths.joinComplete,
        element: (
          <RequireBoarding>
            <BoardedScreen />
          </RequireBoarding>
        ),
      },
      {
        path: paths.today,
        element: (
          <RequireMode mode="ACTIVE">
            <TodayScreen />
          </RequireMode>
        ),
      },
      {
        path: paths.write,
        element: (
          <RequireMode mode="ACTIVE">
            <WriteScreen />
          </RequireMode>
        ),
      },
      {
        path: paths.saved,
        element: (
          <RequireMode mode="ACTIVE">
            <SavedScreen />
          </RequireMode>
        ),
      },
      {
        path: paths.pastDraft,
        element: (
          <RequireMode mode="ACTIVE">
            <PastDraftScreen />
          </RequireMode>
        ),
      },
      {
        path: paths.archive,
        element: (
          <RequireMode mode="ACTIVE">
            <ArchiveScreen />
          </RequireMode>
        ),
      },
      {
        path: paths.detail,
        element: (
          <RequireMode mode="ACTIVE">
            <AnswerDetailScreen />
          </RequireMode>
        ),
      },
      { path: paths.startError, element: <StartErrorScreen /> },
      { path: '*', element: <Navigate to={paths.start} replace /> },
    ],
  },
];
