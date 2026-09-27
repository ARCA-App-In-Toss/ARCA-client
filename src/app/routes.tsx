import type { ReactNode } from 'react';
import { Navigate, Outlet, type RouteObject, useLocation } from 'react-router';
import type { SessionMode } from '../data/api/models.ts';
import { StartErrorScreen } from '../screens/error/StartErrorScreen.tsx';
import { IntroScreen } from '../screens/onboarding/IntroScreen.tsx';
import { TodayScreen } from '../screens/today/TodayScreen.tsx';
import { useAppSnapshot } from './AppServices.tsx';
import { StartScreen } from './bootstrap/StartScreen.tsx';

// Route table (06 §5.1). URLs and history state carry no IDs, tokens, nicknames or content.
export const paths = {
  start: '/',
  intro: '/intro',
  today: '/today',
  startError: '/error/start',
} as const;

const targetPath = { intro: paths.intro, today: paths.today } as const;

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
        path: paths.today,
        element: (
          <RequireMode mode="ACTIVE">
            <TodayScreen />
          </RequireMode>
        ),
      },
      { path: paths.startError, element: <StartErrorScreen /> },
      { path: '*', element: <Navigate to={paths.start} replace /> },
    ],
  },
];
