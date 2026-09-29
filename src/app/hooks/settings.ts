import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { ExternalOpenResult } from '../../domain/ports/platform.ts';
import { useAppServices } from '../services.tsx';

export type SettingsLink = 'terms' | 'privacy' | 'support';

const SETTINGS_POLICY_IDS = { terms: 'terms-of-service', privacy: 'privacy-policy' } as const;

export function useSettingsLinks() {
  const services = useAppServices();
  return useCallback(
    (link: SettingsLink): Promise<ExternalOpenResult> => {
      if (link === 'support') return services.platform.external.openSupport().catch(() => ({ kind: 'unavailable' }));
      const policy = services.session.consentPolicies.find((p) => p.policyId === SETTINGS_POLICY_IDS[link]);
      if (!policy) return Promise.resolve({ kind: 'unavailable' });
      return services.platform.external.openPolicy(policy.url).catch(() => ({ kind: 'unavailable' }));
    },
    [services],
  );
}

export const appVersion: string = __APP_VERSION__;

export function useAllDataDelete() {
  const services = useAppServices();
  const { deletion } = services;
  const view = useSyncExternalStore(deletion.subscribe, deletion.getView, deletion.getView);
  const actions = useMemo(
    () => ({
      enter: () => void deletion.enter(),
      start: () => void deletion.start(),
      recheck: () => void deletion.recheck(),
      retryRecovery: () => void deletion.recover({ userRetry: true }),
      retryCleanup: () => void deletion.retryCleanup(),
      executePrepared: () => void deletion.executePrepared(),
      close: () => void deletion.close(),
      acknowledge: () => deletion.acknowledge(),
      leave: () => {
        deletion.acknowledge();
        services.leaveDeletion();
      },
    }),
    [deletion, services],
  );
  return useMemo(() => ({ view, ...actions }), [view, actions]);
}
