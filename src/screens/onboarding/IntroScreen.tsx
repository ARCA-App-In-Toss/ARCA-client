import { PixelAppShell, ScreenTitle } from '../../ui/components.tsx';
import { copy } from '../../ui/copy.ts';

/** F01 route target. Scenes, skip and boarding arrive in step 4 (03 §4.2); no onboarding bypass. */
export function IntroScreen() {
  return (
    <PixelAppShell>
      <ScreenTitle>{copy['CPY-F01-001']}</ScreenTitle>
    </PixelAppShell>
  );
}
