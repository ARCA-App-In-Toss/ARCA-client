import { useEffect, useMemo, useState } from 'react';
import type { ExternalOpenResult } from '../../domain/ports/platform.ts';
import { useAppServices, useAppSnapshot } from '../services.tsx';

export interface BoardingPolicy {
  policyId: string;
  version: string;
  title: string;
}

export type BoardingResult = { kind: 'boarded' } | { kind: 'failed'; reason: 'offline' | 'general' };

export function useBoarding() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  const epoch = session?.epoch ?? -1;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 약관 목록은 세션 epoch가 바뀔 때만 달라진다.
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

export function useFinishBoarding() {
  const services = useAppServices();
  return () => services.finishBoarding();
}

export function useAllDeletedNotice(): string | null {
  const services = useAppServices();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (services.takeAllDeletedNotice()) setNotice('deleted');
  }, [services]);
  return notice;
}
