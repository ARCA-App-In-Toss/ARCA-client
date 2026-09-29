import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAnswerCommand, usePendingAnswer } from '../../app/hooks/answers.ts';
import { useAnswer, useArchive } from '../../app/hooks/archive.ts';
import { useCopyText } from '../../app/hooks/device.ts';
import { useDraftSession, useStaleEditDraft } from '../../app/hooks/drafts.ts';
import { paths, useAnswerRefs, useRouteState } from '../../app/navigation.ts';
import type { UpdateDraftIdentity } from '../../domain/drafts/draftRepository.ts';
import { DomainFailure } from '../../domain/failures.ts';
import type { AnswerDetail } from '../../domain/models.ts';
import {
  InlineStatus,
  PixelAppShell,
  PixelButton,
  PixelIconButton,
  PixelPlaceholder,
  PixelTextareaField,
  RecordPanel,
  ScreenTitle,
} from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { formatCount, formatDateKst } from '../../ui/format.ts';
import { PixelAlertDialog } from '../../ui/PixelAlertDialog.tsx';
import { PixelIcon } from '../../ui/pixel.tsx';
import { type CopyResult, copyResultMessage, keepLabel, keepStateOf, useAnswerInput } from '../shared/compose.ts';
import { LeaveConfirmDialog, useLeaveGuard } from '../shared/leaveGuard.tsx';
import { editStatus, type RebaseState } from './editStatus.ts';

const KEEP_LABELS = {
  saving: copy['CPY-F22-009'],
  kept: copy['CPY-F22-010'],
  failed: copy['CPY-F22-012'],
};

type RebaseResult = 'rebased' | 'gone' | 'failed';

export function EditScreen() {
  const routeState = useRouteState();
  const refs = useAnswerRefs();
  const answerId = refs.resolve(routeState?.answerRef);
  const detail = useAnswer(answerId);
  const pinned = useRef<AnswerDetail | null>(null);
  pinned.current ??= detail.data ?? null;
  const [, setRebased] = useState(0);
  const base = pinned.current;
  if (!answerId) return <Navigate to={paths.archive} replace />;
  if (!base) return <EditLoading />;
  const rebase = async (): Promise<RebaseResult> => {
    const result = await detail.refetch();
    if (result.error instanceof DomainFailure && result.error.code === 'ANSWER_NOT_FOUND') return 'gone';
    if (!result.data || result.isError) return 'failed';
    pinned.current = result.data;
    setRebased((n) => n + 1);
    return 'rebased';
  };
  return <EditForm key={base.revision} answerId={answerId} base={base} onRebase={rebase} />;
}

function EditLoading() {
  return (
    <PixelAppShell className="arca-page--compose">
      <div className="arca-screen-header">
        <ScreenTitle>{copy['CPY-F22-001']}</ScreenTitle>
      </div>
      <RecordPanel>
        <PixelPlaceholder />
      </RecordPanel>
    </PixelAppShell>
  );
}

function EditForm({
  answerId,
  base,
  onRebase,
}: {
  answerId: string;
  base: AnswerDetail;
  onRebase: () => Promise<RebaseResult>;
}) {
  const routerNavigate = useNavigate();
  const copyText = useCopyText();
  const identity = useRef<UpdateDraftIdentity>({ kind: 'update', answerId, baseRevision: base.revision }).current;
  const draft = useDraftSession(identity, undefined, base.content);
  const stale = useStaleEditDraft(answerId, base.revision);
  const { markStale } = useArchive();
  const command = useAnswerCommand(answerId);
  const pendingOnEntry = usePendingAnswer(answerId);
  const { view } = command;
  const [edited, setEdited] = useState(false);
  const input = useAnswerInput(draft, () => setEdited(true));
  const [rebaseState, setRebaseState] = useState<RebaseState>('idle');
  const [copyResult, setCopyResult] = useState<CopyResult>(null);
  const [staleCopy, setStaleCopy] = useState<CopyResult>(null);
  const [discardDialog, setDiscardDialog] = useState(false);
  const [staleDialog, setStaleDialog] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const discardButtonRef = useRef<HTMLButtonElement | null>(null);
  const staleDiscardRef = useRef<HTMLButtonElement | null>(null);

  const unchanged = draft.text === base.content;
  const busy = view.kind === 'working';
  const inFlight = busy || view.kind === 'unconfirmed';
  const pending = inFlight || pendingOnEntry === 'checking';
  const draftKept = draft.status.kind === 'persisted' || draft.status.kind === 'clean';
  const trackerKept = (view.kind === 'working' || view.kind === 'unconfirmed') && view.trackerKept;
  const canLeaveWhilePending = inFlight && draftKept && trackerKept;
  const guard = useLeaveGuard({
    shouldBlock: () => (inFlight ? !canLeaveWhilePending : !draftKept && !unchanged),
    pending: inFlight,
    flush: draft.flush,
  });

  const viewKind = view.kind;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 저장 상태가 바뀔 때마다 초기화한다.
  useEffect(() => {
    setCopyResult(null);
  }, [viewKind]);

  useEffect(() => {
    if (view.kind !== 'succeeded') return;
    guard.allowLeave();
    routerNavigate(-1);
  }, [view.kind, routerNavigate, guard.allowLeave]);

  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  useEffect(() => {
    if (unchanged && draft.status.kind === 'persisted') void latestDraft.current.discard(base.content);
  }, [unchanged, draft.status.kind, base.content]);

  const conflict = (view.kind === 'notApplied' || view.kind === 'rejected') && view.code === 'REVISION_CONFLICT';
  useEffect(() => {
    if (conflict) markStale();
  }, [conflict, markStale]);

  const { measured, currentCount } = input;
  const overflow = measured.overCount > 0;
  const loading = draft.load.kind === 'loading';

  const leaveTo = () => {
    guard.allowLeave();
    command.consume();
    routerNavigate(-1);
  };

  const onSave = () => {
    if (!measured.savable || unchanged || input.composingRef.current || busy) return;
    setCopyResult(null);
    command.saveEdit({ mode: 'UPDATE', answerId, expectedRevision: base.revision }, draft.flushKept);
  };

  const onLeave = () => {
    if (unchanged && !pending) void draft.discard(base.content);
    routerNavigate(-1);
  };

  const onCopy = async () => {
    const result = await copyText(draft.text);
    setCopyResult(result.kind);
    if (result.kind === 'failed') textareaRef.current?.focus();
  };

  const onReEdit = async () => {
    if (rebaseState !== 'unkept' && !(await draft.flush())) {
      setRebaseState('unkept');
      return;
    }
    setRebaseState('running');
    const result = await onRebase();
    if (result === 'rebased') {
      guard.allowLeave();
      command.consume();
      return;
    }
    if (result === 'gone') {
      leaveTo();
      return;
    }
    setRebaseState('failed');
  };

  const keep = keepStateOf(draft);
  const closedByUser = view.kind === 'notApplied' && view.code === 'COMMAND_CLOSED';
  const saveProblem = (view.kind === 'notApplied' && !closedByUser) || view.kind === 'rejected';
  const baseGone =
    (view.kind === 'notApplied' || view.kind === 'rejected') &&
    (view.code === 'REVISION_CONFLICT' || view.code === 'ANSWER_NOT_FOUND');
  const restoredClean =
    draft.load.kind === 'ready' && draft.load.restored && !unchanged && draft.status.kind === 'clean';
  const status = editStatus({
    view,
    loading,
    keep,
    conflict,
    rebaseState,
    unchanged,
    edited,
    restoredClean,
    copyResult,
    saveProblem,
  });
  const showCopy = pending || keep.failed || saveProblem;
  const textLocked = pending || view.kind === 'reconciled';
  const helpId = 'f22-help';

  return (
    <PixelAppShell className="arca-page--compose">
      <div className="arca-screen-header">
        <PixelIconButton label={copy['CPY-COM-005']} icon="back" buttonRef={backButtonRef} onClick={onLeave} />
        <ScreenTitle>{copy['CPY-F22-001']}</ScreenTitle>
      </div>
      <section className="arca-preface" aria-labelledby="f22-question-label">
        <p className="arca-visually-hidden" id="f22-question-label">
          {copy['CPY-F22-002']}
        </p>
        <p className="arca-question arca-question--quiet">{base.question.text}</p>
        <p className="arca-label">
          {fill(copy['CPY-F21-006'], { createdDateKst: formatDateKst(base.createdDateKst) })}
        </p>
      </section>
      <RecordPanel>
        {loading ? (
          <PixelPlaceholder />
        ) : (
          <>
            <PixelTextareaField
              textareaRef={textareaRef}
              id="f22-answer"
              label={copy['CPY-F22-003']}
              describedBy={`f22-privacy ${helpId}${overflow ? ' f22-error' : ''}`}
              invalid={overflow}
              placeholder={copy['CPY-F22-004']}
              value={draft.text}
              readOnly={textLocked}
              {...input.fieldHandlers}
            />
            <div className="arca-field-help" id={helpId}>
              <span>{keepLabel(draft.status, KEEP_LABELS) ?? (restoredClean ? copy['CPY-F22-011'] : '')}</span>
              <span>{fill(copy['CPY-F22-007'], { currentCount: formatCount(currentCount) })}</span>
            </div>
            {overflow && (
              <p className="arca-field-error" id="f22-error">
                {fill(copy['CPY-F22-008'], { overCount: formatCount(measured.overCount) })}
              </p>
            )}
          </>
        )}
      </RecordPanel>
      <InlineStatus
        message={status.message ?? status.announcement}
        tone={status.danger ? 'danger' : 'neutral'}
        quiet={status.message === null}
      />
      {stale && !pending && (
        <RecordPanel labelledBy="f22-stale-label">
          <p className="arca-text-secondary" id="f22-stale-label">
            {copy['CPY-F22-036']}
          </p>
          <p className="arca-user-text">{stale.text}</p>
          <InlineStatus message={copyResultMessage(staleCopy)} tone={staleCopy === 'failed' ? 'danger' : 'neutral'} />
          <div className="arca-actions">
            <PixelButton
              variant="ghost"
              onClick={() => void copyText(stale.text).then((result) => setStaleCopy(result.kind))}
            >
              {copy['CPY-F22-037']}
            </PixelButton>
            <PixelButton ref={staleDiscardRef} variant="ghost" onClick={() => setStaleDialog(true)}>
              {copy['CPY-F22-038']}
            </PixelButton>
          </div>
        </RecordPanel>
      )}
      <div className="arca-actions">
        {view.kind === 'unconfirmed' && view.recovery ? (
          <PixelButton variant="primary" onClick={() => command.close()}>
            {view.recovery === 'closePrepared' ? copy['CPY-COM-020'] : copy['CPY-COM-023']}
          </PixelButton>
        ) : view.kind === 'unconfirmed' ? (
          <PixelButton variant="primary" onClick={() => command.recheck()}>
            {copy['CPY-F22-021']}
          </PixelButton>
        ) : conflict ? (
          <PixelButton variant="primary" loading={rebaseState === 'running'} onClick={() => void onReEdit()}>
            {copy['CPY-F22-035']}
          </PixelButton>
        ) : view.kind === 'reconciled' ? (
          <PixelButton variant="primary" onClick={leaveTo}>
            {copy['CPY-COM-024']}
          </PixelButton>
        ) : (
          <PixelButton
            variant="primary"
            loading={busy}
            disabled={
              loading || pendingOnEntry === 'checking' || baseGone || (!busy && (!measured.savable || unchanged))
            }
            onClick={
              view.kind === 'notApplied' || view.kind === 'rejected' || view.kind === 'localFailure'
                ? () => {
                    command.consume();
                    onSave();
                  }
                : onSave
            }
          >
            {saveProblem ? copy['CPY-F22-017'] : copy['CPY-F22-014']}
          </PixelButton>
        )}
        {showCopy && (
          <PixelButton variant="ghost" onClick={() => void onCopy()}>
            {copy['CPY-F11-029']}
          </PixelButton>
        )}
        {canLeaveWhilePending && <PixelButton onClick={() => routerNavigate(-1)}>{copy['CPY-F11-040']}</PixelButton>}
        {!pending && !unchanged && (
          <PixelButton ref={discardButtonRef} variant="ghost" onClick={() => setDiscardDialog(true)}>
            {copy['CPY-F22-024']}
          </PixelButton>
        )}
      </div>
      <p className="arca-privacy arca-privacy--centered" id="f22-privacy">
        <PixelIcon name="lock" />
        <span>
          {copy['CPY-F22-005']} {copy['CPY-F22-006']}
        </span>
      </p>
      <PixelAlertDialog
        open={discardDialog}
        title={copy['CPY-F22-025']}
        description={copy['CPY-F22-026']}
        cancelLabel={copy['CPY-F22-027']}
        actionLabel={copy['CPY-F22-028']}
        danger
        returnFocusRef={discardButtonRef}
        onCancel={() => setDiscardDialog(false)}
        onAction={() => {
          setDiscardDialog(false);
          void draft.discard(base.content).then(() => {
            guard.allowLeave();
            routerNavigate(-1);
          });
        }}
      />
      <PixelAlertDialog
        open={staleDialog}
        title={copy['CPY-F22-025']}
        description={copy['CPY-F22-026']}
        cancelLabel={copy['CPY-F22-027']}
        actionLabel={copy['CPY-F22-038']}
        danger
        returnFocusRef={staleDiscardRef}
        onCancel={() => setStaleDialog(false)}
        onAction={() => {
          setStaleDialog(false);
          setStaleCopy(null);
          void stale?.remove().then((removed) => (removed ? textareaRef : staleDiscardRef).current?.focus());
        }}
      />
      <LeaveConfirmDialog guard={guard} returnFocusRef={backButtonRef} />
    </PixelAppShell>
  );
}
