import { paths, useArcaNavigate } from '../app/navigation.ts';
import { PixelIconButton, RootFloatingTabs, ScreenTitle } from '../ui/components.tsx';
import { copy, rootTabLabels } from '../ui/copy.ts';

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

export function RootHeader({ title }: { title: string }) {
  const navigate = useArcaNavigate();
  return (
    <div className="arca-root-header">
      <ScreenTitle>{title}</ScreenTitle>
      <PixelIconButton label={copy['CPY-F10-002']} icon="settings" onClick={() => navigate(paths.settings)} />
    </div>
  );
}
