import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { useCompletionRefresh, useCompletions } from '../../app/hooks/writes.ts';
import { paths, useAnswerRefs, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import type { AnswerWritePresentation, Availability, Today } from '../../domain/models.ts';
import { InlineStatus, PixelAppShell, PixelButton, ScenePanel } from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { formatCount } from '../../ui/format.ts';
import { MemoryFragment } from '../../ui/pixel.tsx';

type Hierarchy = 'archive-first' | 'today-first';

function savedCount(presentation: AnswerWritePresentation | undefined, refreshed: Today | undefined) {
  const count: Availability<{ count: number }> | null =
    presentation?.state === 'AVAILABLE' ? presentation.activeAnswerCount : null;
  if (count?.state !== 'AVAILABLE' && refreshed?.answer.state === 'ANSWERED') return refreshed.activeAnswerCount;
  return count;
}

export function SavedScreen() {
  const routeState = useRouteState();
  const navigate = useArcaNavigate();
  const completions = useCompletions();
  const refresh = useCompletionRefresh();
  const refs = useAnswerRefs();
  const completion = completions.get(refs.resolve(routeState?.answerRef));
  const resultRef = useRef<HTMLHeadingElement>(null);

  const count = savedCount(completion?.presentation, refresh.data);

  const [hierarchy] = useState<Hierarchy>(() =>
    count?.state === 'AVAILABLE' && count.value.count === 1 ? 'archive-first' : 'today-first',
  );
  const [repeatShown] = useState(() => count?.state === 'AVAILABLE' && count.value.count >= 2);

  useEffect(() => {
    resultRef.current?.focus({ preventScroll: true });
  }, []);

  if (!completion) return <Navigate to={paths.today} replace />;

  const infoFailed = count?.state !== 'AVAILABLE';
  const showRefresh = infoFailed || refresh.fetchStatus !== 'idle' || refresh.dataUpdatedAt > 0;
  const toArchive = (
    <PixelButton
      variant={hierarchy === 'archive-first' ? 'primary' : 'secondary'}
      onClick={() => navigate(paths.archive)}
    >
      {copy['CPY-F12-013']}
    </PixelButton>
  );
  const toToday = (
    <PixelButton variant={hierarchy === 'today-first' ? 'primary' : 'secondary'} onClick={() => navigate(paths.today)}>
      {copy['CPY-F12-014']}
    </PixelButton>
  );

  return (
    <PixelAppShell className="arca-page--saved">
      <h1 className="arca-visually-hidden">{copy['CPY-F12-001']}</h1>
      <ScenePanel labelledBy="f12-result" art>
        <div className="arca-formation" aria-hidden="true">
          <MemoryFragment cell={4} />
        </div>
        <h2 ref={resultRef} tabIndex={-1} className="arca-screen-title arca-screen-title--result" id="f12-result">
          {copy['CPY-F12-004']}
        </h2>
        {repeatShown && <p className="arca-text-secondary">{copy['CPY-F12-006']}</p>}
        {count?.state === 'AVAILABLE' ? (
          // biome-ignore lint/a11y/useSemanticElements: 기록 수를 이름 붙은 group으로 묶는다.
          <div role="group" aria-label={copy['CPY-F12-019']} className="arca-memory-count">
            {fill(copy['CPY-F12-012'], { memoryCount: formatCount(count.value.count) })}
          </div>
        ) : (
          // biome-ignore lint/a11y/useSemanticElements: 기록 수를 이름 붙은 group으로 묶는다.
          <div role="group" aria-labelledby="f12-count-label" className="arca-memory-count">
            <span id="f12-count-label">{copy['CPY-F12-019']}</span>{' '}
            <span>{refresh.isFetching ? copy['CPY-F12-008'] : copy['CPY-F12-017']}</span>
          </div>
        )}
      </ScenePanel>
      {showRefresh && (
        <div className="arca-actions">
          <InlineStatus message={infoFailed ? copy['CPY-F12-017'] : null} />
          <PixelButton variant="ghost" loading={refresh.isFetching} onClick={() => void refresh.refetch()}>
            {copy['CPY-F12-018']}
          </PixelButton>
        </div>
      )}
      <div className="arca-actions">
        {hierarchy === 'archive-first' ? (
          <>
            {toArchive}
            {toToday}
          </>
        ) : (
          <>
            {toToday}
            {toArchive}
          </>
        )}
      </div>
    </PixelAppShell>
  );
}
