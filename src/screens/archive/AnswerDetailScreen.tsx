import { useEffect, useRef, useState } from 'react';
import { Navigate, useBlocker, useLocation, useNavigate } from 'react-router';
import { useAnswer, useArchive, useIsOffline } from '../../app/AppServices.tsx';
import { useAnswerCommand, usePendingAnswer } from '../../app/answers.ts';
import { paths, useAnswerRefs, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import { DomainFailure, TransportFailure } from '../../data/failures.ts';
import { prefixExcerpt } from '../../domain/text/graphemes.ts';
import {
  InlineStatus,
  PixelAppShell,
  PixelButton,
  PixelIconButton,
  PixelPlaceholder,
  RecordPanel,
  ScreenTitle,
  StatePanel,
} from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { formatDateKst, isWhitespaceOnly } from '../../ui/format.ts';
import { PixelAlertDialog } from '../../ui/PixelAlertDialog.tsx';

/** Question part in the F23 dialog: the same prefix rule as the F20 rows (04 §5.10 #6). */
const QUESTION_PART = { maxGraphemes: 80, maxLogicalLines: 2 } as const;

type Notice = 'editSaved' | 'editNotSaved' | 'deleteFailed' | 'deleteClosed' | null;

/**
 * F21 — memory detail (03 §6.2, 04 §6.10) with F23 as a logical modal route over it (03 §6.4,
 * 04 §6.12). Reading is complete on its own; edit and delete are secondary. Nothing is removed
 * before the server confirms a delete, and a failure keeps the detail as it was (06 §9.2).
 */
export function AnswerDetailScreen() {
  const routeState = useRouteState();
  const refs = useAnswerRefs();
  const answerId = refs.resolve(routeState?.answerRef);
  const detail = useAnswer(answerId);
  const navigate = useArcaNavigate();
  const routerNavigate = useNavigate();
  const { pathname } = useLocation();
  const { noteDeleted, markStale } = useArchive();
  const command = useAnswerCommand(answerId);
  const pending = usePendingAnswer(answerId);
  const isOffline = useIsOffline();
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const { view } = command;
  const dialogRoute = pathname === paths.deleteAnswer;
  const pendingMode = pending !== 'checking' && pending !== null ? pending.mode : null;
  const deleteRunning = deleting || pendingMode === 'DELETE';
  const unresolved = view.kind === 'working' || view.kind === 'unconfirmed';
  const locked = pending === 'checking' || unresolved;
  // An unresolved delete is tracked until the server settles it, even after "check later" (06 §8.5).
  const deleteUnresolved = deleteRunning && unresolved;
  const deleteUnconfirmed = deleteRunning && view.kind === 'unconfirmed';
  const autoOpened = useRef(false);

  useEffect(() => {
    if (!(detail.error instanceof TransportFailure)) return;
    let active = true;
    void isOffline().then((value) => {
      if (active) setOffline(value);
    });
    return () => {
      active = false;
    };
  }, [detail.error, isOffline]);

  // A delete left unresolved by a restart reopens its dialog once: the server result comes first
  // (IX-036 #5). After "check later" it stays closed; F21 keeps the unconfirmed notice.
  useEffect(() => {
    if (pendingMode === 'DELETE' && !dialogRoute && routeState?.answerRef && !autoOpened.current) {
      autoOpened.current = true;
      navigate(paths.deleteAnswer, { answerRef: routeState.answerRef });
    }
  }, [pendingMode, dialogRoute, routeState?.answerRef, navigate]);

  const closeDialog = () => {
    if (dialogRoute) routerNavigate(-1);
  };
  const latest = useRef({ closeDialog, refetch: detail.refetch });
  latest.current = { closeDialog, refetch: detail.refetch };

  // Declared before the result effect so a settled result can close the dialog in the same commit.
  // While a delete request or its check is running, Back and dismiss stay locked (04 IX-025, 06 §5.1).
  // An unconfirmed result may be closed; the command keeps tracking it (04 §6.12).
  const blocker = useBlocker(() => dialogRoute && deleteRunning && view.kind === 'working');
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  // Settled results of this answer's command, each handled once (06 §8.7).
  useEffect(() => {
    switch (view.kind) {
      case 'succeeded':
        // An edit confirmed on F22 or after leaving it: announced here once, no motion (IX-029).
        command.consume();
        setNotice('editSaved');
        return;
      case 'deleted':
        command.consume();
        noteDeleted();
        navigate(paths.archive, {}, { replace: true });
        return;
      case 'notApplied':
      case 'rejected':
      case 'localFailure': {
        const code = view.kind === 'localFailure' ? null : view.code;
        command.consume();
        if (!deleteRunning) {
          if (view.kind === 'notApplied') setNotice('editNotSaved');
          return;
        }
        setDeleting(false);
        latest.current.closeDialog();
        if (code === 'ANSWER_NOT_FOUND') {
          // Already gone: the list shows the current state (03 F21 missing → F20).
          markStale();
          navigate(paths.archive, {}, { replace: true });
          return;
        }
        setNotice(code === 'COMMAND_CLOSED' ? 'deleteClosed' : 'deleteFailed');
        // A changed answer is never deleted; the latest detail is read (MS-DELETE-002).
        if (code === 'REVISION_CONFLICT') {
          markStale();
          void latest.current.refetch();
        }
        return;
      }
      case 'reconciled':
        command.consume();
        setDeleting(false);
        if (view.reconciliation.nextAction === 'REVIEW_CURRENT_ANSWER') latest.current.closeDialog();
        else navigate(paths.archive, {}, { replace: true });
        return;
      default:
        return;
    }
  }, [view, command, deleteRunning, noteDeleted, markStale, navigate]);

  const detailMissing = detail.error instanceof DomainFailure && detail.error.code === 'ANSWER_NOT_FOUND';
  useEffect(() => {
    if (detailMissing) markStale();
  }, [detailMissing, markStale]);

  // A reload drops the ref: go back to the parent and let the user choose again (06 §5.1).
  if (answerId === null) return <Navigate to={paths.archive} replace />;
  if (detailMissing) return <Navigate to={paths.archive} replace />;

  const header = (
    <div className="arca-screen-header">
      <PixelIconButton label={copy['CPY-COM-005']} icon="back" onClick={() => navigate(paths.archive)} />
      <ScreenTitle>{copy['CPY-F21-001']}</ScreenTitle>
    </div>
  );

  if (!detail.data) {
    return (
      <PixelAppShell>
        {header}
        {detail.isError ? (
          <StatePanel>
            <p>{offline ? copy['CPY-F21-012'] : copy['CPY-F21-011']}</p>
            <PixelButton variant="primary" loading={detail.isFetching} onClick={() => void detail.refetch()}>
              {copy['CPY-F21-013']}
            </PixelButton>
          </StatePanel>
        ) : (
          <RecordPanel>
            <PixelPlaceholder />
            <InlineStatus message={copy['CPY-F21-010']} />
          </RecordPanel>
        )}
      </PixelAppShell>
    );
  }

  const { question, content, createdDateKst, isEdited, revision } = detail.data;
  const editUnresolved = !deleteRunning && (pendingMode === 'UPDATE' || unresolved);

  let status: string | null = null;
  if (editUnresolved) status = copy['CPY-F21-017'];
  else if (deleteUnresolved) status = copy['CPY-F21-019'];
  else if (notice === 'editSaved') status = copy['CPY-F21-014'];
  else if (notice === 'editNotSaved') status = copy['CPY-F22-032'];
  else if (notice === 'deleteFailed') status = copy['CPY-F21-015'];
  else if (notice === 'deleteClosed') status = copy['CPY-COM-027'];

  let dialogStatus: string | null = null;
  let actionLabel: string = copy['CPY-F23-007'];
  if (deleteRunning && view.kind === 'working') dialogStatus = copy['CPY-F23-008'];
  if (deleteUnconfirmed) {
    // No success or failure is claimed; the same command is only checked again (06 §8.5).
    if (view.recovery === 'cleanUpExpired') {
      dialogStatus = copy['CPY-COM-028'];
      actionLabel = copy['CPY-COM-023'];
    } else if (view.recovery === 'closePrepared') {
      actionLabel = copy['CPY-COM-026'];
    } else {
      dialogStatus = copy['CPY-F23-011'];
      actionLabel = copy['CPY-COM-007'];
    }
  }
  const questionPart = prefixExcerpt(question.text, QUESTION_PART.maxGraphemes, QUESTION_PART.maxLogicalLines);

  return (
    <PixelAppShell>
      {header}
      <section className="arca-preface" aria-labelledby="f21-question-label">
        <p className="arca-visually-hidden" id="f21-question-label">
          {copy['CPY-F21-002']}
        </p>
        <time className="arca-question-date" dateTime={createdDateKst}>
          {formatDateKst(createdDateKst)}
        </time>
        <p className="arca-question arca-question--quiet">{question.text}</p>
      </section>
      <RecordPanel labelledBy="f21-answer-label" hero>
        <p className="arca-label" id="f21-answer-label">
          {copy['CPY-F21-004']}
        </p>
        <p className="arca-user-text arca-user-text--reading">{content}</p>
        {isWhitespaceOnly(content) && <p className="arca-text-secondary">{copy['CPY-COM-004']}</p>}
      </RecordPanel>
      {isEdited && <p className="arca-caption arca-text-secondary">{copy['CPY-F21-007']}</p>}
      <InlineStatus
        message={dialogRoute ? null : status}
        tone={notice === 'deleteFailed' || notice === 'editNotSaved' ? 'danger' : 'neutral'}
      />
      <div className="arca-actions">
        {editUnresolved ? (
          <PixelButton onClick={() => navigate(paths.edit, { answerRef: routeState?.answerRef ?? '' })}>
            {copy['CPY-F21-018']}
          </PixelButton>
        ) : (
          <PixelButton
            disabled={locked}
            onClick={() => {
              setNotice(null);
              navigate(paths.edit, { answerRef: routeState?.answerRef ?? '' });
            }}
          >
            {copy['CPY-F21-008']}
          </PixelButton>
        )}
        <PixelButton
          ref={deleteButtonRef}
          variant="danger-text"
          disabled={deleteUnresolved ? view.kind === 'working' : locked || editUnresolved}
          onClick={() => navigate(paths.deleteAnswer, { answerRef: routeState?.answerRef ?? '' })}
        >
          {deleteUnresolved
            ? copy['CPY-F21-020']
            : notice === 'deleteFailed'
              ? copy['CPY-F21-016']
              : copy['CPY-F21-009']}
        </PixelButton>
      </div>
      <PixelAlertDialog
        open={dialogRoute}
        title={copy['CPY-F23-001']}
        description={fill(copy['CPY-F23-002'], { dateKst: formatDateKst(createdDateKst) })}
        cancelLabel={deleteUnconfirmed ? copy['CPY-F23-012'] : copy['CPY-F23-006']}
        actionLabel={actionLabel}
        danger={!deleteUnconfirmed}
        locked={deleteRunning && view.kind === 'working'}
        busy={deleteRunning && view.kind === 'working'}
        status={dialogStatus}
        returnFocusRef={deleteButtonRef}
        onCancel={closeDialog}
        onAction={() => {
          if (deleteUnconfirmed) {
            if (view.recovery) command.close();
            else command.recheck();
            return;
          }
          setNotice(null);
          setDeleting(true);
          command.remove(revision);
        }}
      >
        <div className="arca-dialog-context">
          <p className="arca-label">{copy['CPY-F23-003']}</p>
          <p className="arca-text-secondary">
            {questionPart.text}
            {questionPart.isTruncated && <span aria-hidden="true">…</span>}
          </p>
          <p className="arca-user-text">{copy['CPY-F23-005']}</p>
        </div>
      </PixelAlertDialog>
    </PixelAppShell>
  );
}
