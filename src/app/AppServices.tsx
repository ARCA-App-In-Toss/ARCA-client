import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useMemo, useSyncExternalStore } from 'react';
import type { AnswerDetail, AnswerPage, PassengerProfile, Today } from '../data/api/models.ts';
import { queryKeys } from '../data/query/keys.ts';
import type { ClipboardResult, ExternalOpenResult } from '../platform/ports.ts';
import { type BootstrapState, START_EXCERPT_PROFILE } from './bootstrap/bootstrap.ts';
import type { AppServices, AppSnapshot } from './composition.ts';

// Screens receive summaries and narrow actions only; the service graph (session, api, journal,
// platform) stays inside app/ (06 §3.1–3.2).

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}

function useAppServices(): AppServices {
  return useAppServicesInternal();
}

/** For app/ modules only (hooks that compose services); screens never call this directly. */
export function useAppServicesInternal(): AppServices {
  const services = useContext(AppServicesContext);
  if (!services) throw new Error('AppServicesProvider missing');
  return services;
}

/** Bootstrap phase and session summary only; never tokens or server data (06 §3.3). */
export function useAppSnapshot(): AppSnapshot {
  const services = useAppServices();
  return useSyncExternalStore(services.subscribe, services.getSnapshot, services.getSnapshot);
}

export interface StartActions {
  /** F90 reconnect: repeats the F00 judgement (04 IX-032). */
  retryStart(): Promise<BootstrapState>;
  /** Copies the server support id inside the user gesture (04 IX-022). */
  copySupportCode(code: string): Promise<ClipboardResult>;
  openSupport(): Promise<ExternalOpenResult>;
}

export function useStartActions(): StartActions {
  const services = useAppServices();
  return useMemo(
    () => ({
      retryStart: () => services.start(),
      copySupportCode: (code) => services.platform.clipboard.writeText(code),
      openSupport: () => services.platform.external.openSupport(),
    }),
    [services],
  );
}

/**
 * OP-005 today read model for the confirmed owner/generation. F00 seeds the same key, so F10 consumes
 * it without a second request; no interval polling or staleTime semantics (06 §6.2).
 */
export function useToday() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  const active = session?.mode === 'ACTIVE' && session.generation !== null;
  return useQuery<Today>({
    queryKey: queryKeys.today(session?.ownerScope ?? '', session?.generation ?? '', START_EXCERPT_PROFILE),
    enabled: active,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: ({ signal }) =>
      services.session.run('ACTIVE', (auth) => services.api.getToday(auth, START_EXCERPT_PROFILE, signal)),
  });
}

export function useIsOffline() {
  const services = useAppServices();
  return () => services.platform.network.isOffline();
}

/** OP-011 answer detail for an opaque ref from history state (06 §6.1). */
export function useAnswer(answerId: string | null) {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  const active = session?.mode === 'ACTIVE' && session.generation !== null && answerId !== null;
  return useQuery<AnswerDetail>({
    queryKey: queryKeys.answer(session?.ownerScope ?? '', session?.generation ?? '', answerId ?? ''),
    enabled: active,
    queryFn: ({ signal }) =>
      services.session.run('ACTIVE', (auth) => services.api.getAnswer(auth, answerId ?? '', signal)),
  });
}

/** OP-010 first page for F20 (step 3: first page only; the page chain arrives in step 6). */
export function useArchiveFirstPage() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  const active = session?.mode === 'ACTIVE' && session.generation !== null;
  return useQuery<AnswerPage>({
    queryKey: queryKeys.answers(session?.ownerScope ?? '', session?.generation ?? '', 'STANDARD'),
    enabled: active,
    queryFn: ({ signal }) =>
      services.session.run('ACTIVE', (auth) => services.api.listAnswers(auth, null, 'STANDARD', signal)),
  });
}

/** A required policy as F02 shows it; the document URL stays inside app/ (06 §3.2). */
export interface BoardingPolicy {
  policyId: string;
  version: string;
  title: string;
}

export type BoardingResult = { kind: 'boarded' } | { kind: 'failed'; reason: 'offline' | 'general' };

/**
 * F02 actions (06 §9.1, IX-031). Policies follow the latest OP-001 and re-read when the session epoch
 * changes. A successful OP-003 re-routes to F03 through the app snapshot; the screen only reports
 * failures and never treats an unknown outcome as "not created".
 */
export function useBoarding() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  const epoch = session?.epoch ?? -1;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the policy list changes only with the session epoch.
  const policies = useMemo<BoardingPolicy[]>(
    () =>
      services.session.consentPolicies
        .filter((p) => p.required)
        .map(({ policyId, version, title }) => ({ policyId, version, title })),
    [services, epoch],
  );
  return useMemo(
    () => ({
      policies,
      async submit(consents: readonly { policyId: string; version: string }[]): Promise<BoardingResult> {
        try {
          await services.boarding.submit(consents);
          return { kind: 'boarded' };
        } catch {
          return { kind: 'failed', reason: (await services.platform.network.isOffline()) ? 'offline' : 'general' };
        }
      },
      openPolicy(policyId: string): Promise<ExternalOpenResult> {
        const policy = services.session.consentPolicies.find((p) => p.policyId === policyId);
        if (!policy) return Promise.resolve({ kind: 'unavailable' });
        return services.platform.external.openPolicy(policy.url);
      },
    }),
    [services, policies],
  );
}

/** F03 profile from this visit's OP-003 response, seeded in the new owner's cache (06 §6.1). */
export function useBoardedPassenger() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  const active = session?.mode === 'ACTIVE' && session.generation !== null;
  return useQuery<PassengerProfile>({
    queryKey: queryKeys.passenger(session?.ownerScope ?? '', session?.generation ?? ''),
    enabled: active,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => services.session.run('ACTIVE', (auth) => services.api.getPassenger(auth)),
  });
}

export function useFinishBoarding() {
  const services = useAppServices();
  return () => services.finishBoarding();
}

export type NicknameSaveOutcome =
  | { kind: 'saved' | 'rejected' | 'unsent' | 'unknown' }
  /** Carries the re-read current nickname so F03 can refresh its edit context (IX-035). */
  | { kind: 'expired'; currentNickname: string | null };

/**
 * F03 nickname save (IX-003·IX-035). The expected revision is the profile F03 shows. The coordinator
 * classifies its own outcomes; anything unexpected is treated as unconfirmed, never as skippable.
 */
export function useNicknameSave() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  const passenger = useBoardedPassenger();
  const revision = passenger.data?.revision ?? null;
  return async (nickname: string): Promise<NicknameSaveOutcome> => {
    if (revision === null || !session?.generation) return { kind: 'unknown' };
    let kind: Awaited<ReturnType<typeof services.nickname.save>>;
    try {
      kind = await services.nickname.save(nickname, revision);
    } catch {
      return { kind: 'unknown' };
    }
    if (kind !== 'expired') return { kind };
    const current = services.queryClient.getQueryData<PassengerProfile>(
      queryKeys.passenger(session.ownerScope, session.generation),
    );
    return { kind, currentNickname: current?.nickname ?? null };
  };
}
