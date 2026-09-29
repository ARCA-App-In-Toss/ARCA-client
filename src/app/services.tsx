import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import type { AppServices, AppSnapshot } from './composition.ts';

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}

export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (!services) throw new Error('AppServicesProvider missing');
  return services;
}

export function useAppSnapshot(): AppSnapshot {
  const services = useAppServices();
  return useSyncExternalStore(services.subscribe, services.getSnapshot, services.getSnapshot);
}
