import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useArchive } from '../../app/hooks/archive.ts';
import { useRefreshToday, useToday } from '../../app/hooks/today.ts';
import { paths, useAnswerRefs, useArcaNavigate } from '../../app/navigation.ts';
import type { ArchiveView } from '../../domain/archive/archiveChains.ts';
import type { ArchiveItem } from '../../domain/models.ts';
import {
  InlineStatus,
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
import { useOfflineOnFailure } from '../shared/offline.ts';
import { questionPartOf } from './questionPart.ts';

function monthOf(dateKst: string) {
  const [year, month] = dateKst.split('-').map((part) => Number.parseInt(part, 10));
  return { key: dateKst.slice(0, 7), label: fill(copy['CPY-F20-003'], { year: String(year), month: String(month) }) };
}

const TOP_SLACK_PX = 8;
const atTop = () => window.scrollY <= TOP_SLACK_PX;

export function ArchiveScreen() {
  const archive = useArchive();
  const { view } = archive;
  const today = useToday();
  const refreshToday = useRefreshToday();
  const navigate = useArcaNavigate();
  const refs = useAnswerRefs();
  const offline = useOfflineOnFailure(view.phase === 'error' ? view.firstError : null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const entered = useRef(false);
  const [deletedNotice, setDeletedNotice] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 목록 방문마다 한 번만 실행한다
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

  useEffect(() => {
    if (!view.candidateReady) return;
    const onScroll = () => {
      if (atTop()) archive.applyCandidate({ focus: false });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [view.candidateReady, archive]);

  useEffect(() => {
    if (view.replacedSeq === 0) return;
    window.scrollTo(0, 0);
    const target =
      containerRef.current?.querySelector<HTMLElement>('.arca-memory-row') ??
      containerRef.current?.querySelector<HTMLElement>('h1');
    target?.focus({ preventScroll: true });
  }, [view.replacedSeq]);

  const tabs = <RootTabs current="archive" />;
  const count = today.data?.activeAnswerCount;

  useEffect(() => {
    if (deletedNotice && (view.more !== 'idle' || view.candidateReady || view.refreshFailed || view.added)) {
      setDeletedNotice(false);
    }
  }, [deletedNotice, view.more, view.candidateReady, view.refreshFailed, view.added]);

  const announcement = announcementOf(view, deletedNotice);

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
        <RootHeader title={copy['CPY-F20-001']} count={count} />
        {body}
      </div>
      {view.phase === 'ready' && view.candidateReady && (
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

function announcementOf(view: ArchiveView, deletedNotice: boolean): string | null {
  if (view.more === 'failed' || view.more === 'cursorInvalid') return copy['CPY-F20-019'];
  if (view.more === 'loading') return copy['CPY-F20-017'];
  if (view.candidateReady) return copy['CPY-F20-023'];
  if (view.refreshFailed) return copy['CPY-F20-022'];
  if (view.added) return fill(copy['CPY-F20-018'], { loadedCount: formatCount(view.added.count) });
  if (deletedNotice) return copy['CPY-F23-009'];
  return null;
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
        const heading = month.key !== previousMonth ? month.label : null;
        previousMonth = month.key;
        const question = questionPartOf(item.question.text);
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
                <span className="arca-memory-row__meta">
                  <span>{formatDateKst(item.createdDateKst)}</span>
                </span>
                <span className="arca-visually-hidden">{copy['CPY-F20-007']}</span>
                <span className="arca-memory-row__question">
                  {question.text}
                  {question.isTruncated && <span aria-hidden="true">…</span>}
                </span>
              </MemoryRow>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
