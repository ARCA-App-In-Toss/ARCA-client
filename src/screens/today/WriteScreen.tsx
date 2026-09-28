import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useBlocker } from 'react-router';
import { useRefreshToday, useToday, useTodayRefreshEvents } from '../../app/AppServices.tsx';
import { useDraftSession } from '../../app/drafts.ts';
import { paths, type QuestionRole, useAnswerRefs, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import { type HandoffKeep, usePastDraftRefs } from '../../app/pastDrafts.ts';
import { useAnswerWrite, useCompletions, useCopyText, usePendingWrite } from '../../app/writes.ts';
import type { PrepareAnswerCreate, TodaySema } from '../../data/api/models.ts';
import type { CreateDraftIdentity } from '../../domain/drafts/draftRepository.ts';
import type { KeepStatus } from '../../domain/drafts/draftWriter.ts';
import { countGraphemes, measureAnswer } from '../../domain/text/graphemes.ts';
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
import { PixelAlertDialog } from '../../ui/PixelAlertDialog.tsx';
import { JoyMark, PixelIcon } from '../../ui/pixel.tsx';

function keepLabel(status: KeepStatus): string | null {
  switch (status.kind) {
    case 'persisting':
    case 'editing':
      return copy['CPY-F11-010'];
    case 'persisted':
      return copy['CPY-F11-011'];
    case 'failed':
      return copy['CPY-F11-013'];
    case 'clean':
      return null;
  }
}

type CopyResult = 'copied' | 'failed' | null;

/** Bounded wait for an in-flight keep before the leave decision (04 IX-007: never an endless hold). */
const LEAVE_KEEP_WAIT_MS = 2_000;

function withinMs<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/** F11 — answer writing (03 §5.2, 04 §6.6). Text is kept verbatim; keeping on the device ≠ saving. */
export function WriteScreen() {
  const routeState = useRouteState();
  const today = useToday();
  // The KST boundary hint re-reads OP-005; a new daily SEMA from the server moves the text to F13.
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
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [settledText, setSettledText] = useState<string | null>(null);

  // The SEMA this visit writes for stays fixed; a later OP-005 never swaps the question under the
  // text. A different daily SEMA from the server means the day changed (03 F11 날짜 변경 → F13).
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
  const write = useAnswerWrite(sema?.dailySemaId ?? null);
  const view = write.view;
  // A copy result belongs to the save state it was made in; a new state replaces it.
  const viewKind = view.kind;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on every save-state change.
  useEffect(() => {
    setCopyResult(null);
  }, [viewKind]);

  // Re-entry with an unresolved save rechecks it once; a success confirmed here, on F11, earns F12.
  const pendingOnEntry = usePendingWrite(sema?.dailySemaId ?? null);
  useEffect(() => {
    if (pendingOnEntry && pendingOnEntry !== 'checking') setSavedThisVisit(true);
  }, [pendingOnEntry]);

  // Only a success first confirmed while this screen is open earns F12 (04 IX-036 #6, 06 §8.7).
  const handledSuccess = useRef(false);
  useEffect(() => {
    if (view.kind !== 'succeeded' || !savedThisVisit || handledSuccess.current) return;
    handledSuccess.current = true;
    allowLeaveRef.current = true;
    completions.remember(view.completion);
    write.consume();
    navigate(paths.saved, { answerRef: refs.refFor(view.completion.answerId) });
  }, [view, savedThisVisit, completions, write, navigate, refs]);

  // Date change (server-judged: DATE_CHANGED, a new daily SEMA, or a reconciliation that returns to
  // today) hands the text, question and keeping state to F13; nothing is saved for the past day.
  const rejectedCode = view.kind === 'rejected' ? view.code : null;
  const reconciledAction = view.kind === 'reconciled' ? view.reconciliation.nextAction : null;
  const leavingForPast =
    rejectedCode === 'DATE_CHANGED' ||
    reconciledAction === 'RETURN_TODAY' ||
    reconciledAction === 'RETURN_ARCHIVE' ||
    // A live day change waits for an open IME composition to end: nothing uncommitted moves (06 §7.2).
    (dayChangedLive &&
      settledText === null &&
      (view.kind === 'idle' || view.kind === 'notApplied' || view.kind === 'rejected'));
  const handedOff = useRef(false);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  useEffect(() => {
    // A success already handled on this visit (F12) is never turned into a date-change handoff.
    if (!leavingForPast || handedOff.current || handledSuccess.current || !identity || !question || !sema) return;
    handedOff.current = true;
    const context = { dateKst: sema.dateKst, questionText: question.text };
    void (async () => {
      const current = latestDraft.current;
      const kept = await withinMs(current.flush(), LEAVE_KEEP_WAIT_MS, false);
      const text = latestDraft.current.text;
      allowLeaveRef.current = true;
      write.consume();
      if (text === '') {
        navigate(reconciledAction === 'RETURN_ARCHIVE' ? paths.archive : paths.today, {}, { replace: true });
        return;
      }
      const keep: HandoffKeep = kept
        ? 'kept'
        : latestDraft.current.status.kind === 'failed' || latestDraft.current.load.kind === 'unreadable'
          ? 'failed'
          : 'unsettled';
      const draftRef = pastDraftRefs.handOff(identity, { text, keep, context });
      navigate(paths.pastDraft, { draftRef, pastDraftEntry: 'dateChanged' });
    })();
  }, [leavingForPast, identity, question, sema, write, navigate, pastDraftRefs, reconciledAction]);

  // IX-012: the SEMA was stopped/replaced. The text stays read-only here; copy first, then F10.
  const semaStopped = rejectedCode === 'SEMA_REPLACED' || (semaReplacedLive && view.kind !== 'working');
  const reviewCurrent = view.kind === 'reconciled' && view.reconciliation.nextAction === 'REVIEW_CURRENT_ANSWER';
  // The text is locked once the SEMA stops: keep it now so the unconfirmed state settles quickly.
  useEffect(() => {
    if (semaStopped) void latestDraft.current.flush();
  }, [semaStopped]);

  const busy = view.kind === 'working';
  const pending = busy || view.kind === 'unconfirmed';
  const draftKept = draft.status.kind === 'persisted' || draft.status.kind === 'clean';
  const trackerKept = (view.kind === 'working' || view.kind === 'unconfirmed') && view.trackerKept;
  // Safe exit only when the latest text and the recovery info are both read back (06 §8.6).
  const canLeaveWhilePending = pending && draftKept && trackerKept;

  // Every way out (in-app Back, platform Back, links) goes through IX-007; same-path replaces do not.
  const allowLeaveRef = useRef(false);
  const [leaveDialog, setLeaveDialog] = useState(false);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowLeaveRef.current || currentLocation.pathname === nextLocation.pathname) return false;
    if (pending) return !canLeaveWhilePending;
    return !draftKept;
  });
  const latest = useRef({ pending, flush: draft.flush, blocker });
  latest.current = { pending, flush: draft.flush, blocker };
  // Handle each blocked navigation exactly once (the handles above are recreated every render).
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (latest.current.pending) {
      // Waiting for a result without both keeps: stay (locked), never pretend leaving is safe.
      latest.current.blocker.reset?.();
      return;
    }
    let active = true;
    void withinMs(latest.current.flush(), LEAVE_KEEP_WAIT_MS, false).then((kept) => {
      const current = latest.current.blocker;
      if (!active || current.state !== 'blocked') return;
      if (kept) current.proceed();
      else setLeaveDialog(true);
    });
    return () => {
      active = false;
    };
  }, [blocker.state]);

  // Entry guard only: an answer that appears because of this visit's own save is handled above.
  if (
    role === null ||
    (today.data?.answer.state === 'ANSWERED' && !savedThisVisit && !dayChangedLive && !reviewCurrent)
  ) {
    return <Navigate to={paths.today} replace />;
  }

  const measured = measureAnswer(settledText ?? draft.text);
  // Display the live input count; validation and persistence still wait for IME to settle.
  const currentCount = settledText === null ? measured.count : countGraphemes(draft.text);
  const overflow = measured.overCount > 0;
  const loading = !question || draft.load.kind === 'loading';
  const unreadable = draft.load.kind === 'unreadable';
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
    if (!prepareInput || !measured.savable || composingRef.current || busy) return;
    setCopyResult(null);
    setSavedThisVisit(true);
    write.save(prepareInput, draft.flushKept);
  };

  const onSwitch = async () => {
    if (!sema || pending) return;
    // IX-006: keep the current text first; on failure the question does not change.
    if (!(await draft.flush())) {
      setSwitchBlocked(true);
      return;
    }
    setSwitchBlocked(false);
    const next: QuestionRole = role === 'PRIMARY' ? 'ALTERNATE' : 'PRIMARY';
    setRole(next);
    setSettledText(null);
    navigate(paths.write, { questionRole: next }, { replace: true });
    setAnnouncement(copy['CPY-F11-015']);
  };

  const onLeave = () => navigate(paths.today);

  const onCopy = async () => {
    const result = await copyText(draft.text);
    setCopyResult(result.kind);
    if (result.kind === 'failed') textareaRef.current?.focus();
  };

  // One live message per IX-037: primary save problem → device-keeping state → copy result.
  const keepFailed = unreadable || draft.status.kind === 'failed';
  const keepUnsettled = draft.status.kind === 'persisting' || draft.status.kind === 'editing';
  // A user-closed request is a confirmed outcome the user asked for, not a save failure (IX-041).
  const closedByUser = view.kind === 'notApplied' && view.code === 'COMMAND_CLOSED';
  const saveProblem =
    (view.kind === 'notApplied' && !closedByUser) ||
    (view.kind === 'rejected' && !semaStopped && !leavingForPast) ||
    view.kind === 'localFailure';
  const statusParts: string[] = [];
  if (loading) statusParts.push(copy['CPY-F11-009']);
  if (semaStopped) {
    // IX-012 with the keeping state it actually has (IX-037): kept, failed, or still unconfirmed.
    // 033/034 claim a settled keep; while it is still unconfirmed the server state (not saved) leads
    // and COM-008 follows (IX-037). A dedicated "SEMA stopped, server state only" string is pending in 04.
    if (keepFailed) statusParts.push(copy['CPY-F11-034']);
    else if (keepUnsettled) statusParts.push(copy['CPY-F11-020'], copy['CPY-COM-008']);
    else statusParts.push(copy['CPY-F11-033']);
  } else
    switch (view.kind) {
      case 'working':
        statusParts.push(view.stage === 'confirming' ? copy['CPY-F11-024'] : copy['CPY-F11-019']);
        break;
      case 'unconfirmed':
        if (view.recovery === 'cleanUpExpired') {
          // Past result gone: no success or failure is claimed; keeping problems still show (IX-037).
          statusParts.push(copy['CPY-COM-022']);
          if (keepFailed) statusParts.push(copy['CPY-F11-013']);
          else if (keepUnsettled) statusParts.push(copy['CPY-COM-008']);
          break;
        }
        if (keepFailed) statusParts.push(copy['CPY-F11-027']);
        else if (keepUnsettled) statusParts.push(copy['CPY-F11-044'], copy['CPY-COM-008']);
        else if (!view.trackerKept) statusParts.push(copy['CPY-F11-042']);
        else statusParts.push(copy['CPY-F11-026']);
        break;
      case 'notApplied':
      case 'rejected':
        statusParts.push(closedByUser ? copy['CPY-COM-021'] : copy['CPY-F11-020']);
        // Confirmed keep failure uses the failure copy; COM-008 is only for a keep still unconfirmed (IX-037).
        if (keepFailed) statusParts.push(copy['CPY-F11-013']);
        else if (keepUnsettled) statusParts.push(copy['CPY-COM-008']);
        break;
      case 'localFailure':
        statusParts.push(copy['CPY-F11-013']);
        break;
      case 'reconciled':
        if (view.reconciliation.nextAction === 'CREATE_CURRENT_DAY') statusParts.push(copy['CPY-COM-025']);
        if (keepFailed) statusParts.push(copy['CPY-F11-013']);
        break;
      default:
        if (switchBlocked) statusParts.push(copy['CPY-F11-017']);
        else if (keepFailed) statusParts.push(copy['CPY-F11-013']);
        else if (draft.load.kind === 'ready' && draft.load.restored && draft.status.kind === 'clean') {
          statusParts.push(copy['CPY-F11-012']);
        } else if (announcement) statusParts.push(announcement);
    }
  if (copyResult === 'copied') statusParts.push(copy['CPY-F13-014']);
  if (copyResult === 'failed') statusParts.push(copy['CPY-F13-015']);
  const status = statusParts.length > 0 ? statusParts.join(' ') : null;
  const dangerStatus =
    saveProblem || keepFailed || copyResult === 'failed' || statusParts.includes(copy['CPY-F11-027']);
  // A copy path whenever the text may not survive on this device or the save is unresolved (IX-037, IX-040).
  const showCopy = pending || keepFailed || saveProblem || reviewCurrent;
  const textLocked = pending || semaStopped || reviewCurrent || leavingForPast;

  const helpId = 'f11-help';
  return (
    <PixelAppShell className="arca-page--compose">
      <div className="arca-screen-header">
        <PixelIconButton label={copy['CPY-COM-005']} icon="back" buttonRef={backButtonRef} onClick={onLeave} />
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
              onCompositionStart={() => {
                composingRef.current = true;
                setSettledText(draft.text);
              }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                setSettledText(null);
                draft.compositionEnd(event.currentTarget.value);
              }}
              onChange={(event) => draft.change(event.currentTarget.value, composingRef.current)}
            />
            <div className="arca-field-help" id={helpId}>
              <span>{keepLabel(draft.status) ?? ''}</span>
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
      <InlineStatus message={status} tone={dangerStatus ? 'danger' : 'neutral'} />
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
              allowLeaveRef.current = true;
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
      <PixelAlertDialog
        open={leaveDialog}
        title={copy['CPY-F11-036']}
        description={copy['CPY-F11-037']}
        cancelLabel={copy['CPY-F11-038']}
        actionLabel={copy['CPY-F11-039']}
        returnFocusRef={backButtonRef}
        onCancel={() => {
          setLeaveDialog(false);
          if (blocker.state === 'blocked') blocker.reset();
        }}
        onAction={() => {
          setLeaveDialog(false);
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />
    </PixelAppShell>
  );
}
