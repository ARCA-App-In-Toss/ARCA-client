import { useEffect, useState } from 'react';
import { useIsOffline } from '../../app/hooks/device.ts';
import { TransportFailure } from '../../domain/failures.ts';

export function useOfflineOnFailure(error: unknown): boolean {
  const isOffline = useIsOffline();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!(error instanceof TransportFailure)) return;
    let active = true;
    void isOffline().then((value) => {
      if (active) setOffline(value);
    });
    return () => {
      active = false;
    };
  }, [error, isOffline]);
  return offline;
}
