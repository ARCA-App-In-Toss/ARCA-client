import { useEffect, useRef, useState } from 'react';
import { useIsOffline, useToday } from '../../app/AppServices.tsx';
import { paths, type QuestionRole, useAnswerRefs, useArcaNavigate } from '../../app/navigation.ts';
import { useAnswerWrite, usePendingWrite } from '../../app/writes.ts';
import type { Today, TodayAnswer } from '../../data/api/models.ts';
import { TransportFailure } from '../../data/failures.ts';
import {
  InlineStatus,
  MemoryCount,
  PixelAppShell,
  PixelButton,
  PixelPlaceholder,
  RecordPanel,
  ScenePanel,
  ScreenTitle,
  StatePanel,
} from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { formatCount, formatDateKst, isWhitespaceOnly } from '../../ui/format.ts';
import { RootTabs } from '../RootTabs.tsx';

/** F10 — today's SEMA (03 §5.1, 04 §6.5). Unanswered: question first; answered: own excerpt first. */
export function TodayScreen() {
  const today = useToday();
  const isOffline = useIsOffline();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!(today.error instanceof TransportFailure)) return;
    let active = true;
    void isOffline().then((value) => {
      if (active) setOffline(value);
    });
    return () => {
      active = false;
    };
  }, [today.error, isOffline]);

  const refetch = () => void today.refetch();
  const dailySemaId = today.data?.sema.dailySemaId ?? null;
  const pending = usePendingWrite(dailySemaId);
  const write = useAnswerWrite(dailySemaId);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const noticed = useRef(false);
  // A save confirmed after leaving F11: one notice and synced data, no F12 or haptic (04 IX-036 #6).
  useEffect(() => {
    if (write.view.kind !== 'succeeded' || noticed.current) return;
    noticed.current = true;
    setNotice(copy['CPY-F10-011']);
    write.consume();
  }, [write]);

  if (!today.data) {
    return (
      <PixelAppShell tabs={<RootTabs current="today" />}>
        <ScreenTitle>{copy['CPY-F10-001']}</ScreenTitle>
        {today.isError ? (
          <StatePanel>
            <p>{offline ? copy['CPY-F10-021'] : copy['CPY-F10-020']}</p>
            <PixelButton variant="primary" loading={today.isFetching} onClick={refetch}>
              {copy['CPY-F10-023']}
            </PixelButton>
          </StatePanel>
        ) : (
          <ScenePanel>
            <PixelPlaceholder />
            <InlineStatus message={copy['CPY-F10-019']} />
          </ScenePanel>
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
    <PixelAppShell tabs={<RootTabs current="today" />}>
      <ScreenTitle>{copy['CPY-F10-001']}</ScreenTitle>
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
      {/* The screen's single polite source (02 §12.4); visible statuses above are not live. */}
      <div className="arca-visually-hidden">
        <InlineStatus message={liveMessage} />
      </div>
      {refreshFailed && (
        <div className="arca-actions">
          <InlineStatus message={copy['CPY-F10-022']} tone="danger" live={false} />
          <PixelButton loading={today.isFetching} onClick={refetch}>
            {copy['CPY-F10-023']}
          </PixelButton>
        </div>
      )}
    </PixelAppShell>
  );
}

function SemaMeta({ today }: { today: Today }) {
  return (
    <ul className="arca-meta">
      <li>{copy['CPY-F10-008']}</li>
      <li>{formatDateKst(today.dateKst)}</li>
      <li>{fill(copy['CPY-COM-002'], { semaCode: today.sema.semaCode })}</li>
    </ul>
  );
}

function Count({ today }: { today: Today }) {
  // An unknown count is omitted rather than shown as 0 (04 §5.10).
  if (today.activeAnswerCount.state !== 'AVAILABLE') return null;
  return (
    <MemoryCount text={fill(copy['CPY-COM-003'], { memoryCount: formatCount(today.activeAnswerCount.value.count) })} />
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
  // Primary question first on every entry; only primary ↔ alternate (IX-006, IX-033).
  const [role, setRole] = useState<QuestionRole>('PRIMARY');
  const question = role === 'PRIMARY' ? today.sema.primaryQuestion : today.sema.alternateQuestion;

  if (pendingQuestionId !== null) {
    // An unresolved save for this daily SEMA outranks the plain write state (04 IX-036 #5).
    const pendingRole: QuestionRole =
      pendingQuestionId === today.sema.alternateQuestion.questionId ? 'ALTERNATE' : 'PRIMARY';
    const pendingQuestion = pendingRole === 'PRIMARY' ? today.sema.primaryQuestion : today.sema.alternateQuestion;
    return (
      <>
        <ScenePanel labelledBy="f10-question-label">
          <p className="arca-label" id="f10-question-label">
            {copy['CPY-F10-003']}
          </p>
          <p className="arca-question">{pendingQuestion.text}</p>
        </ScenePanel>
        <InlineStatus message={copy['CPY-F10-038']} live={false} />
        <div className="arca-actions">
          <PixelButton variant="primary" onClick={() => navigate(paths.write, { questionRole: pendingRole })}>
            {copy['CPY-F10-039']}
          </PixelButton>
        </div>
        <SemaMeta today={today} />
        <Count today={today} />
      </>
    );
  }

  return (
    <>
      <ScenePanel labelledBy="f10-question-label">
        <p className="arca-label" id="f10-question-label">
          {copy['CPY-F10-003']}
        </p>
        <p className="arca-question">{question.text}</p>
      </ScenePanel>
      <div className="arca-actions">
        <PixelButton variant="primary" onClick={() => navigate(paths.write, { questionRole: role })}>
          {copy['CPY-F10-005']}
        </PixelButton>
        {/* Focus stays here; the name switches to the next available action (IX-006 #4). */}
        <PixelButton
          onClick={() => {
            const next: QuestionRole = role === 'PRIMARY' ? 'ALTERNATE' : 'PRIMARY';
            const nextQuestion = next === 'PRIMARY' ? today.sema.primaryQuestion : today.sema.alternateQuestion;
            setRole(next);
            onAnnounce(fill(copy['CPY-F10-035'], { questionText: nextQuestion.text }));
          }}
        >
          {role === 'PRIMARY' ? copy['CPY-F10-006'] : copy['CPY-F10-007']}
        </PixelButton>
      </div>
      <SemaMeta today={today} />
      <Count today={today} />
    </>
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
    <>
      <RecordPanel labelledBy={excerpt ? 'f10-excerpt-label' : undefined}>
        <p className="arca-label">{copy['CPY-F10-011']}</p>
        {excerpt ? (
          <>
            <p className="arca-label" id="f10-excerpt-label">
              {excerpt.isTruncated ? copy['CPY-F10-013'] : copy['CPY-F10-012']}
            </p>
            {/* Stored prefix verbatim; the ellipsis is UI-only and never part of the text (04 §5.10). */}
            <p className="arca-user-text">
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
            {/* One retry for one query: the screen-level retry covers it when the refresh failed. */}
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
      <ScenePanel labelledBy="f10-saved-question-label">
        <p className="arca-label" id="f10-saved-question-label">
          {copy['CPY-F10-015']}
        </p>
        <p className="arca-question">{answer.question.text}</p>
      </ScenePanel>
      <SemaMeta today={today} />
      <Count today={today} />
    </>
  );
}
