import { paths, useArcaNavigate } from '../app/navigation.ts';
import type { Today } from '../domain/models.ts';
import { MemoryCount, RootFloatingTabs, type RootTabId, ScreenTitle } from '../ui/components.tsx';
import { copy, fill, rootTabLabels } from '../ui/copy.ts';
import { formatCount } from '../ui/format.ts';

export function RootTabs({ current }: { current: RootTabId }) {
  const navigate = useArcaNavigate();
  return (
    <RootFloatingTabs
      current={current}
      tabs={[
        { id: 'today', label: rootTabLabels.today, onSelect: () => navigate(paths.today) },
        { id: 'archive', label: rootTabLabels.archive, onSelect: () => navigate(paths.archive) },
        { id: 'settings', label: rootTabLabels.settings, onSelect: () => navigate(paths.settings) },
      ]}
    />
  );
}

export function RootHeader({ title, count }: { title: string; count?: Today['activeAnswerCount'] | undefined }) {
  const memoryCount = count?.state === 'AVAILABLE' ? formatCount(count.value.count) : null;
  return (
    <div className="arca-root-header">
      <ScreenTitle>{title}</ScreenTitle>
      {memoryCount !== null && (
        <MemoryCount
          label={fill(copy['CPY-COM-003'], { memoryCount })}
          value={fill(copy['CPY-COM-029'], { memoryCount })}
        />
      )}
    </div>
  );
}
