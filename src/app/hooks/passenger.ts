import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../data/query/keys.ts';
import type { PassengerProfile } from '../../domain/models.ts';
import { useAppServices, useAppSnapshot } from '../services.tsx';

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

export function usePassengerProfile() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  const active = session?.mode === 'ACTIVE' && session.generation !== null;
  return useQuery<PassengerProfile>({
    queryKey: queryKeys.passenger(session?.ownerScope ?? '', session?.generation ?? ''),
    enabled: active,
    refetchOnMount: 'always',
    queryFn: () => services.session.run('ACTIVE', (auth) => services.api.getPassenger(auth)),
  });
}

export type NicknameSaveOutcome =
  | { kind: 'saved' | 'rejected' | 'unsent' | 'unknown' }
  | { kind: 'expired'; currentNickname: string | null };

export function useNicknameSave() {
  const services = useAppServices();
  const { session } = useAppSnapshot();
  const passenger = useBoardedPassenger();
  const revision = passenger.data?.revision ?? null;
  return async (nickname: string | null): Promise<NicknameSaveOutcome> => {
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
