import { InlineStatus, PixelAppShell, ScenePanel, ScreenTitle } from '../../ui/components.tsx';
import { copy } from '../../ui/copy.ts';
import { JoyMark } from '../../ui/pixel.tsx';

/** F00 — start and state check (03 §4.1, 04 §6.1). No user action; no cached private data. */
export function StartScreen() {
  return (
    <PixelAppShell>
      <ScreenTitle>{copy['CPY-F00-001']}</ScreenTitle>
      <ScenePanel art>
        <JoyMark cell={4} />
        <p className="arca-brand">{copy['CPY-F00-002']}</p>
        <InlineStatus message={copy['CPY-F00-003']} />
      </ScenePanel>
    </PixelAppShell>
  );
}
