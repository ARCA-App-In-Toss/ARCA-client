export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';

export function skyPhaseAt(hour: number): SkyPhase {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}
