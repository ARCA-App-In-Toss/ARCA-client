import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useArchive, useIsOffline, useRefreshToday, useToday } from '../../app/AppServices.tsx';
import type { ArchiveView } from '../../app/archive.ts';
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
  StatePanel,
} from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { formatCount, formatDateKst } from '../../ui/format.ts';
import { EmptyArchiveArt } from '../../ui/pixel.tsx';
import { RootHeader, RootTabs } from '../RootTabs.tsx';

/** Question part for rows: 80 EGC / 2 logical lines, prefix only (04 §5.10 #6). */
const QUESTION_PART = { maxGraphemes: 80, maxLogicalLines: 2 } as const;

function monthOf(dateKst: string) {
  const [year, month] = dateKst.split('-').map((part) => Number.parseInt(part, 10));
  return { key: dateKst.slice(0, 7), label: fill(copy['CPY-F20-003'], { year: String(year), month: String(month) }) };
}

/** Scroll position treated as "at the top" for applying a held first page without moving focus. */
const TOP_SLACK_PX = 8;
const atTop = () => window.scrollY <= TOP_SLACK_PX;

/**
 * F20 — voyage records (03 §6.1, 04 §6.9). One page chain per owner/generation: explicit
 * "기록 더 보기" (IX-023), a held newer first page applied only by the user or at the top (IX-042),
 * and the row anchor restored after F21. The count is OP-005's, never derived from rows (06 §6.3).
 */
export function ArchiveScreen() {
  const archive = useArchive();
  const { view } = archive;
  const today = useToday();
  const refreshToday = useRefreshToday();
  const navigate = useArcaNavigate();
  const refs = useAnswerRefs();
  const isOffline = useIsOffline();
  const [offline, setOffline] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const entered = useRef(false);
  const [deletedNotice, setDeletedNotice] = useState(false);

  // Root entry: first page (or a background refresh), except right after F21 where the kept chain
  // and anchor come back first (06 §6.2).
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per F20 visit
  useLayoutEffect(() => {
    if (entered.current) return;
    entered.current = true;
    if (archive.takeDeletedNotice()) setDeletedNotice(true);
    const anchor = archive.enter(atTop);
    if (!anchor) {
      refreshToday();
      return;
    }
    const row = rowRefs.current.get(anchor.answerId);
    if (row) window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - anchor.viewportOffset);
  }, []);

  // Coming back to the top on one's own applies a held first page without moving focus (IX-042).
  useEffect(() => {
    if (!view.candidateReady) return;
    const onScroll = () => {
      if (atTop()) archive.applyCandidate({ focus: false });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [view.candidateReady, archive]);

  // The user chose "최신 기록 보기": top of the new chain, focus on its first record or the title.
  useEffect(() => {
    if (view.replacedSeq === 0) return;
    window.scrollTo(0, 0);
    const target =
      containerRef.current?.querySelector<HTMLElement>('.arca-memory-row') ??
      containerRef.current?.querySelector<HTMLElement>('h1');
    target?.focus({ preventScroll: true });
  }, [view.replacedSeq]);

  useEffect(() => {
    if (view.phase !== 'error' || !(view.firstError instanceof TransportFailure)) return;
    let active = true;
    void isOffline().then((value) => {
      if (active) setOffline(value);
    });
    return () => {
      active = false;
    };
  }, [view.phase, view.firstError, isOffline]);

  const tabs = <RootTabs current="archive" />;
  const count = today.data?.activeAnswerCount;

  useEffect(() => {
    if (deletedNotice && (view.more !== 'idle' || view.candidateReady || view.refreshFailed || view.added)) {
      setDeletedNotice(false);
    }
  }, [deletedNotice, view.more, view.candidateReady, view.refreshFailed, view.added]);

  // One polite source for this screen; visible statuses below are not live (02 §12.4).
  let announcement: string | null = null;
  if (view.more === 'failed' || view.more === 'cursorInvalid') announcement = copy['CPY-F20-019'];
  else if (view.more === 'loading') announcement = copy['CPY-F20-017'];
  else if (view.candidateReady) announcement = copy['CPY-F20-023'];
  else if (view.refreshFailed) announcement = copy['CPY-F20-022'];
  else if (view.added) announcement = fill(copy['CPY-F20-018'], { loadedCount: formatCount(view.added.count) });
  else if (deletedNotice) announcement = copy['CPY-F23-009'];
  // Once any later status takes the live region, the deletion is not announced again.

  let body: React.ReactNode;
  if (view.phase !== 'ready') {
    body =
      view.phase === 'error' ? (
        <StatePanel>
          <p>{offline ? copy['CPY-F20-015'] : copy['CPY-F20-014']}</p>
          <PixelButton variant="primary" onClick={() => archive.retryFirst()}>
            {copy['CPY-F20-020']}
          </PixelButton>
        </StatePanel>
      ) : (
        <RecordPanel>
          <PixelPlaceholder />
          <InlineStatus message={copy['CPY-F20-010']} />
        </RecordPanel>
      );
  } else if (view.items.length === 0) {
    body = (
      <StatePanel centered>
        <EmptyArchiveArt />
        <h2 className="arca-label">{copy['CPY-F20-011']}</h2>
        <PixelButton variant="primary" onClick={() => navigate(paths.today)}>
          {copy['CPY-F20-013']}
        </PixelButton>
      </StatePanel>
    );
  } else {
    body = (
      <>
        <ArchiveList
          items={view.items}
          rowRefs={rowRefs.current}
          onSelect={(answerId, row) => {
            archive.saveAnchor(answerId, row.getBoundingClientRect().top);
            navigate(paths.detail, { answerRef: refs.refFor(answerId) });
          }}
        />
        <ListEnd
          view={view}
          onMore={archive.loadMore}
          onReloadFirst={archive.reloadFirst}
          onRefresh={() => archive.refresh(atTop)}
        />
      </>
    );
  }

  return (
    <PixelAppShell tabs={tabs}>
      <div ref={containerRef} className="arca-stack">
        <RootHeader title={copy['CPY-F20-001']} />
        {count?.state === 'AVAILABLE' && (
          <MemoryCount text={fill(copy['CPY-F20-002'], { memoryCount: formatCount(count.value.count) })} />
        )}
        {body}
      </div>
      {view.phase === 'ready' && view.candidateReady && (
        // Floats above the tabs so the rows being read are not pushed (IX-042).
        <div className="arca-archive-candidate">
          <InlineStatus message={copy['CPY-F20-023']} live={false} />
          <PixelButton onClick={() => archive.applyCandidate({ focus: true })}>{copy['CPY-F20-024']}</PixelButton>
        </div>
      )}
      <div role="status" aria-live="polite" className="arca-visually-hidden">
        {announcement}
      </div>
    </PixelAppShell>
  );
}

function ListEnd({
  view,
  onMore,
  onReloadFirst,
  onRefresh,
}: {
  view: ArchiveView;
  onMore: () => void;
  onReloadFirst: () => void;
  onRefresh: () => void;
}) {
  const endRef = useRef<HTMLParagraphElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const moreFocused = useRef(false);
  const showMore = view.hasMore && (view.more === 'idle' || view.more === 'loading');
  const showEnd = !view.hasMore && view.loadedExtra && view.more === 'idle';
  // The last page removes "기록 더 보기"; focus stays at the list end instead of falling to the page.
  useEffect(() => {
    if (!showMore && showEnd && moreFocused.current) endRef.current?.focus({ preventScroll: true });
    moreFocused.current = false;
  }, [showMore, showEnd]);
  return (
    <div className="arca-list-end">
      {view.more === 'loading' && <InlineStatus message={copy['CPY-F20-017']} live={false} />}
      {view.more === 'failed' && (
        <>
          <InlineStatus message={copy['CPY-F20-019']} tone="danger" live={false} />
          <PixelButton onClick={onMore}>{copy['CPY-F20-020']}</PixelButton>
        </>
      )}
      {view.more === 'cursorInvalid' && (
        // The rejected cursor is not guessed again; a fresh first page is offered instead (06 §6.3).
        <>
          <InlineStatus message={copy['CPY-F20-019']} tone="danger" live={false} />
          <PixelButton onClick={onReloadFirst}>{copy['CPY-F20-024']}</PixelButton>
        </>
      )}
      {showMore && (
        <PixelButton
          ref={moreRef}
          loading={view.more === 'loading'}
          onClick={() => {
            moreFocused.current = document.activeElement === moreRef.current;
            onMore();
          }}
        >
          {copy['CPY-F20-016']}
        </PixelButton>
      )}
      {showEnd && (
        <p ref={endRef} tabIndex={-1} className="arca-inline-status">
          {copy['CPY-F20-021']}
        </p>
      )}
      {view.refreshFailed && (
        <>
          <InlineStatus message={copy['CPY-F20-022']} live={false} />
          <PixelButton onClick={onRefresh}>{copy['CPY-F20-020']}</PixelButton>
        </>
      )}
    </div>
  );
}

function ArchiveList({
  items,
  rowRefs,
  onSelect,
}: {
  items: readonly ArchiveItem[];
  rowRefs: Map<string, HTMLLIElement>;
  onSelect: (answerId: string, row: HTMLLIElement) => void;
}) {
  let previousMonth: string | null = null;
  return (
    <ul className="arca-list">
      {items.map((item) => {
        const month = monthOf(item.createdDateKst);
        // A month heading only where the real KST year-month changes (03 §6.1).
        const heading = month.key !== previousMonth ? month.label : null;
        previousMonth = month.key;
        const question = prefixExcerpt(item.question.text, QUESTION_PART.maxGraphemes, QUESTION_PART.maxLogicalLines);
        return (
          <Fragment key={item.answerId}>
            {heading && (
              <li>
                <h2 className="arca-month">{heading}</h2>
              </li>
            )}
            <li
              ref={(node) => {
                if (node) rowRefs.set(item.answerId, node);
                else rowRefs.delete(item.answerId);
              }}
            >
              <MemoryRow
                onSelect={() => {
                  const row = rowRefs.get(item.answerId);
                  if (row) onSelect(item.answerId, row);
                }}
              >
                <span className="arca-visually-hidden">{copy['CPY-F20-007']}</span>
                <span className="arca-memory-row__question">
                  {question.text}
                  {question.isTruncated && <span aria-hidden="true">…</span>}
                </span>
                <span className="arca-memory-row__meta">
                  <span>{formatDateKst(item.createdDateKst)}</span>
                </span>
              </MemoryRow>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
