import { paths, useArcaNavigate } from '../app/navigation.ts';
import { RootFloatingTabs } from '../ui/components.tsx';
import { rootTabLabels } from '../ui/copy.ts';

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
