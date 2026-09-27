import { Fragment, useEffect, useState } from 'react';
import { useArchiveFirstPage, useIsOffline, useToday } from '../../app/AppServices.tsx';
import { paths, useAnswerRefs, useArcaNavigate } from '../../app/navigation.ts';
import type { ArchiveItem } from '../../data/api/models.ts';
import { TransportFailure } from '../../data/failures.ts';
import { prefixExcerpt } from '../../domain/text/graphemes.ts';
import {
  InlineStatus,
  MemoryCount,
  MemoryRow,
  PixelAppShell,
  PixelButton,
  PixelPlaceholder,
  RecordPanel,
  ScreenTitle,
  StatePanel,
} from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { formatCount, formatDateKst } from '../../ui/format.ts';
import { RootTabs } from '../RootTabs.tsx';

/** Question part for rows: 80 EGC / 2 logical lines, prefix only (04 §5.10 #6). */
const QUESTION_PART = { maxGraphemes: 80, maxLogicalLines: 2 } as const;

function monthOf(dateKst: string) {
  const [year, month] = dateKst.split('-').map((part) => Number.parseInt(part, 10));
  return { key: dateKst.slice(0, 7), label: fill(copy['CPY-F20-003'], { year: String(year), month: String(month) }) };
}

/**
 * F20 — voyage records (03 §6.1, 04 §6.9). Step 3 shows the first page (newest 20); the page chain,
 * "기록 더 보기" and the refresh candidate arrive in step 6.
 */
export function ArchiveScreen() {
  const page = useArchiveFirstPage();
  const today = useToday();
  const navigate = useArcaNavigate();
  const refs = useAnswerRefs();
  const isOffline = useIsOffline();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!(page.error instanceof TransportFailure)) return;
    let active = true;
    void isOffline().then((value) => {
      if (active) setOffline(value);
    });
    return () => {
      active = false;
    };
  }, [page.error, isOffline]);

  const tabs = <RootTabs current="archive" />;
  const count = today.data?.activeAnswerCount;

  let body: React.ReactNode;
  if (!page.data) {
    body = page.isError ? (
      <StatePanel>
        <p>{offline ? copy['CPY-F20-015'] : copy['CPY-F20-014']}</p>
        <PixelButton variant="primary" loading={page.isFetching} onClick={() => void page.refetch()}>
          {copy['CPY-F20-020']}
        </PixelButton>
      </StatePanel>
    ) : (
      <RecordPanel>
        <PixelPlaceholder />
        <InlineStatus message={copy['CPY-F20-010']} />
      </RecordPanel>
    );
  } else if (page.data.items.length === 0) {
    body = (
      <StatePanel>
        <h2 className="arca-label">{copy['CPY-F20-011']}</h2>
        <PixelButton variant="primary" onClick={() => navigate(paths.today)}>
          {copy['CPY-F20-013']}
        </PixelButton>
      </StatePanel>
    );
  } else {
    body = (
      <ArchiveList
        items={page.data.items}
        onSelect={(answerId) => navigate(paths.detail, { answerRef: refs.refFor(answerId) })}
      />
    );
  }

  return (
    <PixelAppShell tabs={tabs}>
      <ScreenTitle>{copy['CPY-F20-001']}</ScreenTitle>
      {count?.state === 'AVAILABLE' && (
        <MemoryCount text={fill(copy['CPY-F20-002'], { memoryCount: formatCount(count.value.count) })} />
      )}
      {body}
    </PixelAppShell>
  );
}

function ArchiveList({ items, onSelect }: { items: ArchiveItem[]; onSelect: (answerId: string) => void }) {
  let previousMonth: string | null = null;
  return (
    <ul className="arca-list">
      {items.map((item) => {
        const month = monthOf(item.createdDateKst);
        // A month heading only where the real KST year-month changes (03 §6.1).
        const heading = month.key !== previousMonth ? month.label : null;
        previousMonth = month.key;
        const question = prefixExcerpt(item.question.text, QUESTION_PART.maxGraphemes, QUESTION_PART.maxLogicalLines);
        const excerpt = item.excerpt.state === 'AVAILABLE' ? item.excerpt.value : null;
        return (
          <Fragment key={item.answerId}>
            {heading && (
              <li>
                <h2 className="arca-month">{heading}</h2>
              </li>
            )}
            <li>
              <MemoryRow onSelect={() => onSelect(item.answerId)}>
                <span className="arca-label">{excerpt?.isTruncated ? copy['CPY-F20-005'] : copy['CPY-F20-004']}</span>
                <span className="arca-user-text">
                  {excerpt?.text}
                  {excerpt?.isTruncated && <span aria-hidden="true">…</span>}
                </span>
                <span className="arca-label">{copy['CPY-F20-007']}</span>
                <span className="arca-text-secondary">
                  {question.text}
                  {question.isTruncated && <span aria-hidden="true">…</span>}
                </span>
                <span className="arca-label">{formatDateKst(item.createdDateKst)}</span>
              </MemoryRow>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
