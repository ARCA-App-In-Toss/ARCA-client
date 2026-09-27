import { createContext, type ReactNode, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ClipboardResult, ExternalOpenResult } from '../platform/ports.ts';
import type { BootstrapState } from './bootstrap/bootstrap.ts';
import type { AppServices, AppSnapshot } from './composition.ts';

// Screens receive summaries and narrow actions only; the service graph (session, api, journal,
// platform) stays inside app/ (06 §3.1–3.2).

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}

function useAppServices(): AppServices {
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
