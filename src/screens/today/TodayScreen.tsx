import { type ReactNode, useEffect, useRef, useState } from 'react';
import { usePastDrafts } from '../../app/hooks/pastDrafts.ts';
import { useSkyPhase } from '../../app/hooks/sky.ts';
import { useToday, useTodayRefreshEvents } from '../../app/hooks/today.ts';
import { useAnswerWrite, usePendingWrite } from '../../app/hooks/writes.ts';
import { paths, type QuestionRole, useAnswerRefs, useArcaNavigate } from '../../app/navigation.ts';
import type { Today, TodayAnswer } from '../../domain/models.ts';
import {
  CapsuleDisplay,
  InlineStatus,
  InsetPanel,
  MemoryRow,
  PixelAppShell,
  PixelButton,
  PixelPlaceholder,
  RecordPanel,
  StatePanel,
} from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { formatDateKst, formatInstantKst, isWhitespaceOnly } from '../../ui/format.ts';
import { PixelSheet } from '../../ui/PixelSheet.tsx';
import { CapsuleBackdrop, MemoryFragment } from '../../ui/pixel.tsx';
import { RootHeader, RootTabs } from '../RootTabs.tsx';
import { useOfflineOnFailure } from '../shared/offline.ts';

function QuestionLabel({ id, text, dateKst }: { id: string; text: string; dateKst: string }) {
  return (
    <div className="arca-question-heading">
      <p className="arca-label arca-label--signal" id={id}>
        {text}
      </p>
      <QuestionDate dateKst={dateKst} />
    </div>
  );
}

export function TodayScreen() {
  const today = useToday();
  useTodayRefreshEvents({ onEntry: true });
  const offline = useOfflineOnFailure(today.error);
  const sky = useSkyPhase();

  const refetch = () => void today.refetch();
  const dailySemaId = today.data?.sema.dailySemaId ?? null;
  const pending = usePendingWrite(dailySemaId);
  const write = useAnswerWrite(dailySemaId);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const noticed = useRef(false);
  useEffect(() => {
    if (write.view.kind !== 'succeeded' || noticed.current) return;
    noticed.current = true;
    setNotice(copy['CPY-F10-011']);
    write.consume();
  }, [write]);

  const backdrop = <CapsuleBackdrop sky={sky} />;

  if (!today.data) {
    return (
      <PixelAppShell className="arca-page--capsule" backdrop={backdrop} tabs={<RootTabs current="today" />}>
        <RootHeader title={copy['CPY-F10-001']} />
        {today.isError ? (
          <StatePanel>
            <p>{offline ? copy['CPY-F10-021'] : copy['CPY-F10-020']}</p>
            <PixelButton variant="primary" loading={today.isFetching} onClick={refetch}>
              {copy['CPY-F10-023']}
            </PixelButton>
          </StatePanel>
        ) : (
          <CapsuleDisplay>
            <PixelPlaceholder />
            <InlineStatus message={copy['CPY-F10-019']} />
          </CapsuleDisplay>
        )}
      </PixelAppShell>
    );
  }

  const data = today.data;
  const refreshFailed = today.isError;
  const pendingQuestionId =
    pending !== 'checking' &&
    pending &&
    (write.view.kind === 'idle' || write.view.kind === 'working' || write.view.kind === 'unconfirmed')
      ? pending.questionId
      : null;
  const pendingShown = pendingQuestionId !== null && data.answer.state === 'UNANSWERED';
  const answeredExcerptMissing = data.answer.state === 'ANSWERED' && data.answer.value.excerpt.state !== 'AVAILABLE';
  const liveMessage =
    notice ??
    (pendingShown ? copy['CPY-F10-038'] : null) ??
    (refreshFailed ? copy['CPY-F10-022'] : null) ??
    (answeredExcerptMissing ? copy['CPY-F10-018'] : null) ??
    announcement;
  return (
    <PixelAppShell className="arca-page--capsule" backdrop={backdrop} tabs={<RootTabs current="today" />}>
      <RootHeader title={copy['CPY-F10-001']} count={data.activeAnswerCount} />
      {data.answer.state === 'UNANSWERED' ? (
        <Unanswered today={data} onAnnounce={setAnnouncement} pendingQuestionId={pendingQuestionId} />
      ) : (
        <Answered
          today={data}
          answer={data.answer.value}
          onRetry={refetch}
          retrying={today.isFetching}
          showRetry={!refreshFailed}
        />
      )}
      <PastDrafts currentDailySemaId={data.sema.dailySemaId} />
      <div className="arca-visually-hidden">
        <InlineStatus message={liveMessage} />
      </div>
      {refreshFailed && (
        <InsetPanel>
          <InlineStatus message={copy['CPY-F10-022']} tone="danger" live={false} />
          <PixelButton loading={today.isFetching} onClick={refetch}>
            {copy['CPY-F10-023']}
          </PixelButton>
        </InsetPanel>
      )}
    </PixelAppShell>
  );
}

function QuestionDate({ dateKst }: { dateKst: string }) {
  return (
    <time className="arca-question-date" dateTime={dateKst}>
      {formatDateKst(dateKst)}
    </time>
  );
}

function questionOf(today: Today, role: QuestionRole) {
  return role === 'PRIMARY' ? today.sema.primaryQuestion : today.sema.alternateQuestion;
}

function QuestionCapsule({ today, text, children }: { today: Today; text: string; children: ReactNode }) {
  return (
    <CapsuleDisplay labelledBy="f10-question-label">
      <QuestionLabel id="f10-question-label" text={copy['CPY-F10-003']} dateKst={today.dateKst} />
      <p className="arca-question arca-question--lead">{text}</p>
      {children}
    </CapsuleDisplay>
  );
}

function Unanswered({
  today,
  pendingQuestionId,
  onAnnounce,
}: {
  today: Today;
  pendingQuestionId: string | null;
  onAnnounce: (message: string) => void;
}) {
  const navigate = useArcaNavigate();
  const [role, setRole] = useState<QuestionRole>('PRIMARY');

  if (pendingQuestionId !== null) {
    const pendingRole: QuestionRole =
      pendingQuestionId === today.sema.alternateQuestion.questionId ? 'ALTERNATE' : 'PRIMARY';
    return (
      <QuestionCapsule today={today} text={questionOf(today, pendingRole).text}>
        <InlineStatus message={copy['CPY-F10-038']} live={false} />
        <div className="arca-actions">
          <PixelButton variant="primary" onClick={() => navigate(paths.write, { questionRole: pendingRole })}>
            {copy['CPY-F10-039']}
          </PixelButton>
        </div>
      </QuestionCapsule>
    );
  }

  return (
    <QuestionCapsule today={today} text={questionOf(today, role).text}>
      <div className="arca-actions">
        <PixelButton variant="primary" onClick={() => navigate(paths.write, { questionRole: role })}>
          {copy['CPY-F10-005']}
        </PixelButton>
        <PixelButton
          variant="ghost"
          onClick={() => {
            const next: QuestionRole = role === 'PRIMARY' ? 'ALTERNATE' : 'PRIMARY';
            setRole(next);
            onAnnounce(fill(copy['CPY-F10-035'], { questionText: questionOf(today, next).text }));
          }}
        >
          {role === 'PRIMARY' ? copy['CPY-F10-006'] : copy['CPY-F10-007']}
        </PixelButton>
      </div>
    </QuestionCapsule>
  );
}

function Answered({
  today,
  answer,
  onRetry,
  retrying,
  showRetry,
}: {
  today: Today;
  answer: TodayAnswer;
  onRetry: () => void;
  retrying: boolean;
  showRetry: boolean;
}) {
  const navigate = useArcaNavigate();
  const refs = useAnswerRefs();
  const excerpt = answer.excerpt.state === 'AVAILABLE' ? answer.excerpt.value : null;

  return (
    <CapsuleDisplay>
      <section className="arca-preface" aria-labelledby="f10-saved-question-label">
        <p className="arca-visually-hidden" id="f10-saved-question-label">
          {copy['CPY-F10-015']}
        </p>
        <QuestionDate dateKst={today.dateKst} />
        <p className="arca-question arca-question--quiet">{answer.question.text}</p>
      </section>
      <RecordPanel labelledBy={excerpt ? 'f10-excerpt-label' : undefined} hero>
        <p className="arca-sender arca-sender--compact">
          <MemoryFragment cell={2} />
          <span className="arca-label arca-label--signal">{copy['CPY-F10-011']}</span>
        </p>
        {excerpt ? (
          <>
            <p className="arca-label" id="f10-excerpt-label">
              {excerpt.isTruncated ? copy['CPY-F10-013'] : copy['CPY-F10-012']}
            </p>
            <p className="arca-user-text arca-user-text--reading">
              {excerpt.text}
              {excerpt.isTruncated && <span aria-hidden="true">…</span>}
            </p>
            {isWhitespaceOnly(excerpt.text) && !excerpt.isTruncated && (
              <p className="arca-text-secondary">{copy['CPY-COM-004']}</p>
            )}
          </>
        ) : (
          <div className="arca-actions">
            <InlineStatus message={copy['CPY-F10-018']} live={false} />
            {showRetry && (
              <PixelButton variant="ghost" loading={retrying} onClick={onRetry}>
                {copy['CPY-F10-023']}
              </PixelButton>
            )}
          </div>
        )}
      </RecordPanel>
      <div className="arca-actions">
        <PixelButton
          variant="primary"
          onClick={() => navigate(paths.detail, { answerRef: refs.refFor(answer.answerId) })}
        >
          {copy['CPY-F10-016']}
        </PixelButton>
      </div>
    </CapsuleDisplay>
  );
}

function PastDrafts({ currentDailySemaId }: { currentDailySemaId: string }) {
  const navigate = useArcaNavigate();
  const [open, setOpen] = useState(false);
  const list = usePastDrafts(currentDailySemaId, true);
  const sheetList = usePastDrafts(currentDailySemaId, open);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (open || !selected) return;
    navigate(paths.pastDraft, { draftRef: selected, pastDraftEntry: 'review' });
  }, [open, selected, navigate]);
  if (list.kind !== 'ready' || list.rows.length === 0) return null;
  return (
    <InsetPanel>
      <p className="arca-label">{copy['CPY-F10-024']}</p>
      <p className="arca-text-secondary">{copy['CPY-F10-025']}</p>
      <PixelButton ref={triggerRef} onClick={() => setOpen(true)}>
        {copy['CPY-F10-026']}
      </PixelButton>
      <PixelSheet
        open={open}
        title={copy['CPY-F10-027']}
        description={copy['CPY-F10-028']}
        closeLabel={copy['CPY-F10-034']}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
      >
        {sheetList.kind === 'loading' ? (
          <PixelPlaceholder />
        ) : sheetList.kind === 'failed' ? (
          <InlineStatus message={copy['CPY-F10-033']} tone="danger" />
        ) : sheetList.rows.length === 0 ? (
          <InlineStatus message={copy['CPY-F10-032']} />
        ) : (
          <ul className="arca-sheet-list">
            {sheetList.rows.map((row) => (
              <li key={row.ref}>
                <MemoryRow
                  onSelect={() => {
                    setOpen(false);
                    setSelected(row.ref);
                  }}
                >
                  <span>{formatDateKst(row.context.dateKst)}</span>
                  <span className="arca-question">{row.context.questionText}</span>
                  <span className="arca-text-secondary">
                    {fill(copy['CPY-F10-031'], { expiresAtKst: formatInstantKst(row.expiresAt) })}
                  </span>
                </MemoryRow>
              </li>
            ))}
          </ul>
        )}
      </PixelSheet>
    </InsetPanel>
  );
}
