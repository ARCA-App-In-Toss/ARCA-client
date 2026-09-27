import { paths, useArcaNavigate } from '../app/navigation.ts';
import { PixelIconButton, RootFloatingTabs, ScreenTitle } from '../ui/components.tsx';
import { copy, rootTabLabels } from '../ui/copy.ts';

/** F10/F20 root tabs (02 §9.8). */
export function RootTabs({ current }: { current: 'today' | 'archive' }) {
  const navigate = useArcaNavigate();
  return (
    <RootFloatingTabs
      current={current}
      tabs={[
        { id: 'today', label: rootTabLabels.today, onSelect: () => navigate(paths.today) },
        { id: 'archive', label: rootTabLabels.archive, onSelect: () => navigate(paths.archive) },
      ]}
    />
  );
}

/** F10/F20 title row with the settings entry (03 §3 #5); the icon button never hides the title. */
export function RootHeader({ title }: { title: string }) {
  const navigate = useArcaNavigate();
  return (
    <div className="arca-root-header">
      <ScreenTitle>{title}</ScreenTitle>
      <PixelIconButton label={copy['CPY-F10-002']} glyph="⚙" onClick={() => navigate(paths.settings)} />
    </div>
  );
}
