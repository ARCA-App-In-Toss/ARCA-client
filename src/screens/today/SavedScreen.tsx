import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { paths, useAnswerRefs, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import { useCompletionRefresh, useCompletions } from '../../app/writes.ts';
import type { Availability, Excerpt } from '../../data/api/models.ts';
import { InlineStatus, PixelAppShell, PixelButton, ScenePanel } from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { formatCount } from '../../ui/format.ts';

type Hierarchy = 'archive-first' | 'today-first';

/**
 * F12 — memory saved (03 §5.3, 04 §6.7, IX-039). Only reachable from a success confirmed while F11
 * was open; the completion model lives in memory for this visit. The formation animation (CMP-024)
 * awaits its assets, so the static completion state required for Reduced Motion is shown.
 */
export function SavedScreen() {
  const routeState = useRouteState();
  const navigate = useArcaNavigate();
  const completions = useCompletions();
  const refresh = useCompletionRefresh();
  const refs = useAnswerRefs();
  const completion = completions.get(refs.resolve(routeState?.answerRef));
  const resultRef = useRef<HTMLHeadingElement>(null);

  const presentation = completion?.presentation;
  let excerpt: Availability<Excerpt> | null = presentation?.state === 'AVAILABLE' ? presentation.excerpt : null;
  let count: Availability<{ count: number }> | null =
    presentation?.state === 'AVAILABLE' ? presentation.activeAnswerCount : null;
  // A user-requested re-query may fill what the command result could not (never re-saves).
  const refreshed = refresh.data?.answer.state === 'ANSWERED' ? refresh.data : null;
  if (refreshed && refreshed.answer.state === 'ANSWERED') {
    if (excerpt?.state !== 'AVAILABLE') excerpt = refreshed.answer.value.excerpt;
    if (count?.state !== 'AVAILABLE') count = refreshed.activeAnswerCount;
  }

  // Button order is fixed the first time they become usable: 1 → archive first, else today first.
  const [hierarchy] = useState<Hierarchy>(() =>
    count?.state === 'AVAILABLE' && count.value.count === 1 ? 'archive-first' : 'today-first',
  );
  const [repeatShown] = useState(() => count?.state === 'AVAILABLE' && count.value.count >= 2);

  useEffect(() => {
    // Completion heading receives focus instead of the screen title (04 IX-018, IX-020).
    resultRef.current?.focus({ preventScroll: true });
  }, []);

  if (!completion) return <Navigate to={paths.today} replace />;

  const infoFailed = excerpt?.state !== 'AVAILABLE' || count?.state !== 'AVAILABLE';
  // Once asked for, the re-query control stays in this visit so arriving info never drops focus.
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
    <PixelAppShell>
      <h1 className="arca-visually-hidden">{copy['CPY-F12-001']}</h1>
      <ScenePanel labelledBy="f12-result">
        <h2 ref={resultRef} tabIndex={-1} className="arca-screen-title" id="f12-result">
          {copy['CPY-F12-004']}
        </h2>
        {repeatShown && <p>{copy['CPY-F12-006']}</p>}
        {excerpt?.state === 'AVAILABLE' ? (
          <>
            <p className="arca-label" id="f12-excerpt-label">
              {excerpt.value.isTruncated ? copy['CPY-F12-010'] : copy['CPY-F12-009']}
            </p>
            <p className="arca-user-text" aria-describedby="f12-excerpt-label">
              {excerpt.value.text}
              {excerpt.value.isTruncated && <span aria-hidden="true">…</span>}
            </p>
          </>
        ) : null}
        {/* The label is named once: aria-label for a known count, the visible Label otherwise (IX-039). */}
        {count?.state === 'AVAILABLE' ? (
          // biome-ignore lint/a11y/useSemanticElements: a labelled group for the count (IX-039).
          <div role="group" aria-label={copy['CPY-F12-019']} className="arca-memory-count">
            {fill(copy['CPY-F12-012'], { memoryCount: formatCount(count.value.count) })}
          </div>
        ) : (
          // biome-ignore lint/a11y/useSemanticElements: a labelled group for the count (IX-039).
          <div role="group" aria-labelledby="f12-count-label" className="arca-memory-count">
            <span id="f12-count-label">{copy['CPY-F12-019']}</span>{' '}
            <span>{refresh.isFetching ? copy['CPY-F12-008'] : copy['CPY-F12-017']}</span>
          </div>
        )}
      </ScenePanel>
      {showRefresh && (
        <div className="arca-actions">
          <InlineStatus
            message={infoFailed ? (excerpt?.state !== 'AVAILABLE' ? copy['CPY-F12-016'] : copy['CPY-F12-017']) : null}
          />
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
