import { useMemo } from 'react';
import type { ClipboardResult, ExternalOpenResult } from '../../domain/ports/platform.ts';
import type { BootstrapState } from '../bootstrap/bootstrap.ts';
import { useAppServices } from '../services.tsx';

export { useAppSnapshot } from '../services.tsx';

export interface StartActions {
  retryStart(): Promise<BootstrapState>;
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
