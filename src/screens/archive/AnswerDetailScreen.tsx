import { useEffect, useRef, useState } from 'react';
import { Navigate, useBlocker, useLocation, useNavigate } from 'react-router';
import { useAnswerCommand, usePendingAnswer } from '../../app/hooks/answers.ts';
import { useAnswer, useArchive } from '../../app/hooks/archive.ts';
import { paths, useAnswerRefs, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import { DomainFailure } from '../../domain/failures.ts';
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
import { copy } from '../../ui/copy.ts';
import { formatDateKst, isWhitespaceOnly } from '../../ui/format.ts';
import { PixelAlertDialog } from '../../ui/PixelAlertDialog.tsx';
import { useOfflineOnFailure } from '../shared/offline.ts';
import { deleteDialogState, detailStatus, type Notice } from './detailStatus.ts';

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
  const offline = useOfflineOnFailure(detail.error);
  const [notice, setNotice] = useState<Notice>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const { view } = command;
  const dialogRoute = pathname === paths.deleteAnswer;
  const pendingMode = pending !== 'checking' && pending !== null ? pending.mode : null;
  const deleteRunning = deleting || pendingMode === 'DELETE';
  const unresolved = view.kind === 'working' || view.kind === 'unconfirmed';
  const locked = pending === 'checking' || unresolved;
  const deleteUnresolved = deleteRunning && unresolved;
  const deleteUnconfirmed = deleteRunning && view.kind === 'unconfirmed';
  const autoOpened = useRef(false);
  const leavingDeleted = useRef(false);

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

  const blocker = useBlocker(() => dialogRoute && deleteRunning && view.kind === 'working');
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  useEffect(() => {
    switch (view.kind) {
      case 'succeeded':
        command.consume();
        setNotice('editSaved');
        return;
      case 'deleted':
        leavingDeleted.current = true;
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
          markStale();
          navigate(paths.archive, {}, { replace: true });
          return;
        }
        setNotice(code === 'COMMAND_CLOSED' ? 'deleteClosed' : 'deleteFailed');
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

  const { question, content, createdDateKst, revision } = detail.data;
  const editUnresolved = !deleteRunning && (pendingMode === 'UPDATE' || unresolved);

  const status = detailStatus({ editUnresolved, deleteUnresolved, notice });
  const dialog = deleteDialogState(view, deleteRunning);
  const deleteBusy = (deleteRunning && view.kind === 'working') || leavingDeleted.current;

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
      <InlineStatus
        message={dialogRoute ? null : status.message}
        tone={status.danger ? 'danger' : 'neutral'}
        quiet={notice === 'editSaved'}
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
        description={copy['CPY-F23-005']}
        cancelLabel={deleteUnconfirmed ? copy['CPY-F23-012'] : copy['CPY-F23-006']}
        actionLabel={dialog.actionLabel}
        danger={!deleteUnconfirmed}
        pairActions={!deleteUnconfirmed}
        locked={deleteBusy}
        busy={deleteBusy}
        status={dialog.status}
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
      />
    </PixelAppShell>
  );
}
