import { useEffect, useState } from 'react';
import type { PlatformPort } from '../../domain/ports/platform.ts';
import { type SkyPhase, skyPhaseAt } from '../../ui/sky.ts';
import { useAppServices } from '../services.tsx';

function currentPhase(platform: PlatformPort): SkyPhase {
  return skyPhaseAt(new Date(platform.clock.now()).getHours());
}

export function useSkyPhase(): SkyPhase {
  const { platform } = useAppServices();
  const [phase, setPhase] = useState(() => currentPhase(platform));
  useEffect(
    () =>
      platform.lifecycle.onVisibilityChange((visible) => {
        if (visible) setPhase(currentPhase(platform));
      }),
    [platform],
  );
  return phase;
}
