import { type ReactNode, useLayoutEffect } from 'react';
import { Navigate, Outlet, type RouteObject, useLocation, useNavigationType } from 'react-router';
import type { SessionMode } from '../domain/models.ts';
import { AnswerDetailScreen } from '../screens/archive/AnswerDetailScreen.tsx';
import { ArchiveScreen } from '../screens/archive/ArchiveScreen.tsx';
import { EditScreen } from '../screens/archive/EditScreen.tsx';
import { StartErrorScreen } from '../screens/error/StartErrorScreen.tsx';
import { BoardedScreen } from '../screens/onboarding/BoardedScreen.tsx';
import { BoardingScreen } from '../screens/onboarding/BoardingScreen.tsx';
import { IntroScreen } from '../screens/onboarding/IntroScreen.tsx';
import { DeleteAllScreen } from '../screens/settings/DeleteAllScreen.tsx';
import { SettingsScreen } from '../screens/settings/SettingsScreen.tsx';
import { PastDraftScreen } from '../screens/today/PastDraftScreen.tsx';
import { SavedScreen } from '../screens/today/SavedScreen.tsx';
import { TodayScreen } from '../screens/today/TodayScreen.tsx';
import { WriteScreen } from '../screens/today/WriteScreen.tsx';
import { StartScreen } from './bootstrap/StartScreen.tsx';
import { paths } from './navigation.ts';
import { useAppSnapshot } from './services.tsx';

export { paths };

const targetPath = {
  intro: paths.intro,
  today: paths.today,
  boarded: paths.joinComplete,
  deletion: paths.deleteAll,
} as const;

function ScrollReset() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  // biome-ignore lint/correctness/useExhaustiveDependencies: route가 바뀔 때만 한 번 실행한다.
  useLayoutEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

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
  if (bootstrap.target === 'deletion' && pathname !== paths.deleteAll) {
    return <Navigate to={paths.deleteAll} replace />;
  }
  return (
    <>
      <ScrollReset />
      <Outlet />
    </>
  );
}

function RequireMode({ mode, children }: { mode: SessionMode; children: ReactNode }) {
  const { bootstrap, session } = useAppSnapshot();
  const { pathname } = useLocation();
  if (session?.mode === mode) return <>{children}</>;
  const fallback = bootstrap.phase === 'ready' ? targetPath[bootstrap.target] : paths.start;
  if (fallback === pathname) return <StartScreen />;
  return <Navigate to={fallback} replace />;
}

function RequireDeletionAccess({ children }: { children: ReactNode }) {
  const { bootstrap, session } = useAppSnapshot();
  const { pathname } = useLocation();
  if (session?.mode === 'ACTIVE' || session?.mode === 'DELETION_RECOVERY') return <>{children}</>;
  const fallback = bootstrap.phase === 'ready' ? targetPath[bootstrap.target] : paths.start;
  if (fallback === pathname) return <StartScreen />;
  return <Navigate to={fallback} replace />;
}

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
        children: [{ path: 'delete', element: null }],
      },
      {
        path: paths.edit,
        element: (
          <RequireMode mode="ACTIVE">
            <EditScreen />
          </RequireMode>
        ),
      },
      {
        path: paths.settings,
        element: (
          <RequireMode mode="ACTIVE">
            <SettingsScreen />
          </RequireMode>
        ),
      },
      {
        path: paths.deleteAll,
        element: (
          <RequireDeletionAccess>
            <DeleteAllScreen />
          </RequireDeletionAccess>
        ),
      },
      { path: paths.startError, element: <StartErrorScreen /> },
      { path: '*', element: <Navigate to={paths.start} replace /> },
    ],
  },
];
