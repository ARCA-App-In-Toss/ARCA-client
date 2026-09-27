import { PixelAppShell, ScreenTitle } from '../../ui/components.tsx';
import { copy } from '../../ui/copy.ts';

/** F10 route target. Question, writing and saved states arrive in step 3 (03 §5.1). */
export function TodayScreen() {
  return (
    <PixelAppShell>
      <ScreenTitle>{copy['CPY-F10-001']}</ScreenTitle>
    </PixelAppShell>
  );
}
