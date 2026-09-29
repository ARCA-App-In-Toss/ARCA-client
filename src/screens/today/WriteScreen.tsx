import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { useCopyText } from '../../app/hooks/device.ts';
import { useDraftSession } from '../../app/hooks/drafts.ts';
import { type HandoffKeep, usePastDraftRefs } from '../../app/hooks/pastDrafts.ts';
import { useRefreshToday, useToday, useTodayRefreshEvents } from '../../app/hooks/today.ts';
import { useAnswerWrite, useCompletions, usePendingWrite } from '../../app/hooks/writes.ts';
import { paths, type QuestionRole, useAnswerRefs, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import type { CreateDraftIdentity } from '../../domain/drafts/draftRepository.ts';
import type { PrepareAnswerCreate, TodaySema } from '../../domain/models.ts';
import {
  InlineStatus,
  PixelAppShell,
  PixelButton,
  PixelIconButton,
  PixelPlaceholder,
  PixelTextareaField,
  RecordPanel,
  ScenePanel,
  ScreenTitle,
} from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { formatCount } from '../../ui/format.ts';
import { JoyMark, PixelIcon } from '../../ui/pixel.tsx';
import { type CopyResult, keepLabel, keepStateOf, useAnswerInput } from '../shared/compose.ts';
import { LEAVE_KEEP_WAIT_MS, LeaveConfirmDialog, useLeaveGuard, withinMs } from '../shared/leaveGuard.tsx';
import { writeStatus } from './writeStatus.ts';

const KEEP_LABELS = {
  saving: copy['CPY-F11-010'],
  kept: copy['CPY-F11-011'],
  failed: copy['CPY-F11-013'],
};

export function WriteScreen() {
  const routeState = useRouteState();
  const today = useToday();
  useTodayRefreshEvents({ onEntry: false });
  const navigate = useArcaNavigate();
  const copyText = useCopyText();
  const completions = useCompletions();
  const refs = useAnswerRefs();
  const pastDraftRefs = usePastDraftRefs();
  const refreshToday = useRefreshToday();
  const [role, setRole] = useState<QuestionRole | null>(routeState?.questionRole ?? null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [switchBlocked, setSwitchBlocked] = useState(false);
  const [copyResult, setCopyResult] = useState<CopyResult>(null);
  const [savedThisVisit, setSavedThisVisit] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);

  const pinnedSema = useRef<TodaySema | null>(null);
  pinnedSema.current ??= today.data?.sema ?? null;
  const sema = pinnedSema.current;
  const liveSema = today.data?.sema ?? null;
  const dayChangedLive = sema !== null && liveSema !== null && liveSema.dailySemaId !== sema.dailySemaId;
  const semaReplacedLive =
    sema !== null &&
    liveSema !== null &&
    liveSema.dailySemaId === sema.dailySemaId &&
    (liveSema.semaId !== sema.semaId || liveSema.version !== sema.version);
  const question = sema && role ? (role === 'PRIMARY' ? sema.primaryQuestion : sema.alternateQuestion) : null;
  const identity = useMemo<CreateDraftIdentity | null>(
    () =>
      sema && question
        ? {
            kind: 'create',
            dailySemaId: sema.dailySemaId,
            semaId: sema.semaId,
            semaVersion: sema.version,
            questionId: question.questionId,
            questionVersion: question.version,
          }
        : null,
    [sema, question],
  );
  const draft = useDraftSession(
    identity,
    sema && question ? { dateKst: sema.dateKst, questionText: question.text } : undefined,
  );
  const input = useAnswerInput(draft);
  const write = useAnswerWrite(sema?.dailySemaId ?? null);
  const view = write.view;

  const busy = view.kind === 'working';
  const pending = busy || view.kind === 'unconfirmed';
  const draftKept = draft.status.kind === 'persisted' || draft.status.kind === 'clean';
  const trackerKept = (view.kind === 'working' || view.kind === 'unconfirmed') && view.trackerKept;
  const canLeaveWhilePending = pending && draftKept && trackerKept;
  const guard = useLeaveGuard({
    shouldBlock: () => (pending ? !canLeaveWhilePending : !draftKept),
    pending,
    flush: draft.flush,
  });

  const viewKind = view.kind;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 저장 상태가 바뀔 때마다 초기화한다.
  useEffect(() => {
    setCopyResult(null);
  }, [viewKind]);

  const pendingOnEntry = usePendingWrite(sema?.dailySemaId ?? null);
  useEffect(() => {
    if (pendingOnEntry && pendingOnEntry !== 'checking') setSavedThisVisit(true);
  }, [pendingOnEntry]);

  const handledSuccess = useRef(false);
  useEffect(() => {
    if (view.kind !== 'succeeded' || !savedThisVisit || handledSuccess.current) return;
    handledSuccess.current = true;
    guard.allowLeave();
    completions.remember(view.completion);
    write.consume();
    navigate(paths.saved, { answerRef: refs.refFor(view.completion.answerId) });
  }, [view, savedThisVisit, completions, write, navigate, refs, guard.allowLeave]);

  const rejectedCode = view.kind === 'rejected' ? view.code : null;
  const reconciledAction = view.kind === 'reconciled' ? view.reconciliation.nextAction : null;
  const leavingForPast =
    rejectedCode === 'DATE_CHANGED' ||
    reconciledAction === 'RETURN_TODAY' ||
    reconciledAction === 'RETURN_ARCHIVE' ||
    (dayChangedLive &&
      !input.composing &&
      (view.kind === 'idle' || view.kind === 'notApplied' || view.kind === 'rejected'));
  const handedOff = useRef(false);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  useEffect(() => {
    if (!leavingForPast || handedOff.current || handledSuccess.current || !identity || !question || !sema) return;
    handedOff.current = true;
    const context = { dateKst: sema.dateKst, questionText: question.text };
    void (async () => {
      const kept = await withinMs(latestDraft.current.flush(), LEAVE_KEEP_WAIT_MS, false);
      const current = latestDraft.current;
      guard.allowLeave();
      write.consume();
      if (current.text === '') {
        navigate(reconciledAction === 'RETURN_ARCHIVE' ? paths.archive : paths.today, {}, { replace: true });
        return;
      }
      const keep: HandoffKeep = kept
        ? 'kept'
        : current.status.kind === 'failed' || current.load.kind === 'unreadable'
          ? 'failed'
          : 'unsettled';
      const draftRef = pastDraftRefs.handOff(identity, { text: current.text, keep, context });
      navigate(paths.pastDraft, { draftRef, pastDraftEntry: 'dateChanged' });
    })();
  }, [leavingForPast, identity, question, sema, write, navigate, pastDraftRefs, reconciledAction, guard.allowLeave]);

  const semaStopped = rejectedCode === 'SEMA_REPLACED' || (semaReplacedLive && view.kind !== 'working');
  const reviewCurrent = view.kind === 'reconciled' && view.reconciliation.nextAction === 'REVIEW_CURRENT_ANSWER';
  useEffect(() => {
    if (semaStopped) void latestDraft.current.flush();
  }, [semaStopped]);

  if (
    role === null ||
    (today.data?.answer.state === 'ANSWERED' && !savedThisVisit && !dayChangedLive && !reviewCurrent)
  ) {
    return <Navigate to={paths.today} replace />;
  }

  const { measured, currentCount } = input;
  const overflow = measured.overCount > 0;
  const loading = !question || draft.load.kind === 'loading';
  const prepareInput: PrepareAnswerCreate | null =
    sema && question
      ? {
          mode: 'CREATE',
          dailySemaId: sema.dailySemaId,
          semaId: sema.semaId,
          semaVersion: sema.version,
          questionId: question.questionId,
          questionVersion: question.version,
        }
      : null;

  const onSave = () => {
    if (!prepareInput || !measured.savable || input.composingRef.current || busy) return;
    setCopyResult(null);
    setSavedThisVisit(true);
    write.save(prepareInput, draft.flushKept);
  };

  const onSwitch = async () => {
    if (!sema || pending) return;
    if (!(await draft.flush())) {
      setSwitchBlocked(true);
      return;
    }
    setSwitchBlocked(false);
    const next: QuestionRole = role === 'PRIMARY' ? 'ALTERNATE' : 'PRIMARY';
    setRole(next);
    input.resetComposition();
    navigate(paths.write, { questionRole: next }, { replace: true });
    setAnnouncement(copy['CPY-F11-015']);
  };

  const onCopy = async () => {
    const result = await copyText(draft.text);
    setCopyResult(result.kind);
    if (result.kind === 'failed') textareaRef.current?.focus();
  };

  const keep = keepStateOf(draft);
  const saveProblem =
    (view.kind === 'notApplied' && view.code !== 'COMMAND_CLOSED') ||
    (view.kind === 'rejected' && !semaStopped && !leavingForPast) ||
    view.kind === 'localFailure';
  const status = writeStatus({
    view,
    loading,
    semaStopped,
    keep,
    switchBlocked,
    restoredClean: draft.load.kind === 'ready' && draft.load.restored && draft.status.kind === 'clean',
    announcement,
    copyResult,
    saveProblem,
  });
  const showCopy = pending || keep.failed || saveProblem || reviewCurrent;
  const textLocked = pending || semaStopped || reviewCurrent || leavingForPast;

  const helpId = 'f11-help';
  return (
    <PixelAppShell className="arca-page--compose">
      <div className="arca-screen-header">
        <PixelIconButton
          label={copy['CPY-COM-005']}
          icon="back"
          buttonRef={backButtonRef}
          onClick={() => navigate(paths.today)}
        />
        <ScreenTitle>{copy['CPY-F11-001']}</ScreenTitle>
      </div>
      <ScenePanel labelledBy="f11-question-label">
        <div className="arca-sender arca-sender--compact">
          <JoyMark cell={2} />
          <p className="arca-label arca-label--signal" id="f11-question-label">
            {copy['CPY-F11-002']}
          </p>
        </div>
        <p className="arca-question">{question?.text}</p>
        <PixelButton
          variant="ghost"
          className="arca-button--inline"
          disabled={loading || textLocked}
          onClick={() => void onSwitch()}
        >
          {role === 'PRIMARY' ? copy['CPY-F10-006'] : copy['CPY-F10-007']}
        </PixelButton>
      </ScenePanel>
      <RecordPanel>
        {loading ? (
          <PixelPlaceholder />
        ) : (
          <>
            <PixelTextareaField
              textareaRef={textareaRef}
              id="f11-answer"
              label={copy['CPY-F11-003']}
              describedBy={`f11-privacy ${helpId}${overflow ? ' f11-error' : ''}`}
              invalid={overflow}
              placeholder={copy['CPY-F11-004']}
              value={draft.text}
              readOnly={textLocked}
              {...input.fieldHandlers}
            />
            <div className="arca-field-help" id={helpId}>
              <span>{keepLabel(draft.status, KEEP_LABELS) ?? ''}</span>
              <span>{fill(copy['CPY-F11-007'], { currentCount: formatCount(currentCount) })}</span>
            </div>
            {overflow && (
              <p className="arca-field-error" id="f11-error">
                {fill(copy['CPY-F11-008'], { overCount: formatCount(measured.overCount) })}
              </p>
            )}
            <p className="arca-privacy" id="f11-privacy">
              <PixelIcon name="lock" />
              <span>
                {copy['CPY-F11-005']} {copy['CPY-F11-006']}
              </span>
            </p>
            {draft.status.kind === 'failed' && !pending && (
              <PixelButton variant="ghost" onClick={() => void draft.flush()}>
                {copy['CPY-F11-014']}
              </PixelButton>
            )}
          </>
        )}
      </RecordPanel>
      <InlineStatus message={status.message} tone={status.danger ? 'danger' : 'neutral'} />
      <div className="arca-actions">
        {semaStopped ? (
          <>
            <PixelButton variant="primary" onClick={() => void onCopy()}>
              {copy['CPY-F11-029']}
            </PixelButton>
            <PixelButton
              onClick={() => {
                write.consume();
                refreshToday();
                navigate(paths.today);
              }}
            >
              {copy['CPY-F11-035']}
            </PixelButton>
          </>
        ) : view.kind === 'reconciled' && view.reconciliation.nextAction === 'REVIEW_CURRENT_ANSWER' ? (
          <PixelButton
            variant="primary"
            onClick={() => {
              if (view.reconciliation.nextAction !== 'REVIEW_CURRENT_ANSWER') return;
              const { answerId } = view.reconciliation;
              guard.allowLeave();
              write.consume();
              navigate(paths.detail, { answerRef: refs.refFor(answerId) });
            }}
          >
            {copy['CPY-COM-024']}
          </PixelButton>
        ) : view.kind === 'unconfirmed' && view.recovery ? (
          <PixelButton
            variant="primary"
            onClick={() => {
              setSavedThisVisit(true);
              setCopyResult(null);
              write.close();
            }}
          >
            {view.recovery === 'closePrepared' ? copy['CPY-COM-020'] : copy['CPY-COM-023']}
          </PixelButton>
        ) : view.kind === 'unconfirmed' ? (
          <PixelButton
            variant="primary"
            onClick={() => {
              setSavedThisVisit(true);
              setCopyResult(null);
              write.recheck();
            }}
          >
            {view.trackerKept ? copy['CPY-F11-028'] : copy['CPY-F11-041']}
          </PixelButton>
        ) : (
          <PixelButton
            variant="primary"
            loading={busy}
            disabled={loading || (!busy && !measured.savable)}
            onClick={
              view.kind === 'notApplied' || view.kind === 'rejected' || view.kind === 'reconciled'
                ? () => {
                    write.consume();
                    onSave();
                  }
                : onSave
            }
          >
            {view.kind === 'notApplied' || view.kind === 'rejected' ? copy['CPY-F11-021'] : copy['CPY-F11-018']}
          </PixelButton>
        )}
        {showCopy && !semaStopped && (
          <PixelButton variant="ghost" onClick={() => void onCopy()}>
            {copy['CPY-F11-029']}
          </PixelButton>
        )}
        {canLeaveWhilePending && <PixelButton onClick={() => navigate(paths.today)}>{copy['CPY-F11-040']}</PixelButton>}
      </div>
      <LeaveConfirmDialog guard={guard} returnFocusRef={backButtonRef} />
    </PixelAppShell>
  );
}
