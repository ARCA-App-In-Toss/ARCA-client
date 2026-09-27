import { useEffect, useRef, useState } from 'react';
import { Navigate, useBlocker, useNavigate } from 'react-router';
import { useAnswer, useArchive } from '../../app/AppServices.tsx';
import { useAnswerCommand, usePendingAnswer } from '../../app/answers.ts';
import { useDraftSession, useStaleEditDraft } from '../../app/drafts.ts';
import { paths, useAnswerRefs, useRouteState } from '../../app/navigation.ts';
import { useCopyText } from '../../app/writes.ts';
import type { AnswerDetail } from '../../data/api/models.ts';
import { DomainFailure } from '../../data/failures.ts';
import type { UpdateDraftIdentity } from '../../domain/drafts/draftRepository.ts';
import type { KeepStatus } from '../../domain/drafts/draftWriter.ts';
import { measureAnswer } from '../../domain/text/graphemes.ts';
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
import { formatCount, formatDateKst } from '../../ui/format.ts';
import { PixelAlertDialog } from '../../ui/PixelAlertDialog.tsx';

function keepLabel(status: KeepStatus): string | null {
  switch (status.kind) {
    case 'persisting':
    case 'editing':
      return copy['CPY-F22-009'];
    case 'persisted':
      return copy['CPY-F22-010'];
    case 'failed':
      return copy['CPY-F22-012'];
    case 'clean':
      return null;
  }
}

/** Bounded wait for an in-flight keep before the leave decision (04 IX-007: never an endless hold). */
const LEAVE_KEEP_WAIT_MS = 2_000;

function withinMs<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

type CopyResult = 'copied' | 'failed' | null;

/** Result of reading the latest detail to edit on it after REVISION_CONFLICT. */
type RebaseResult = 'rebased' | 'gone' | 'failed';

/**
 * F22 — edit an existing answer (03 §6.3, 04 §6.11). The edit draft is keyed by answer + base
 * revision; the server copy stays until a confirmed success, and there is no F12 or motion (IX-029).
 */
export function EditScreen() {
  const routeState = useRouteState();
  const refs = useAnswerRefs();
  const answerId = refs.resolve(routeState?.answerRef);
  const detail = useAnswer(answerId);
  // The version this visit edits stays fixed; a later OP-011 never swaps the base under the text.
  // Only the explicit re-edit after a conflict moves it, and the old input stays on its old base.
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
  // A new base revision is a new edit identity: the form starts over from the latest server text.
  return <EditForm key={base.revision} answerId={answerId} base={base} onRebase={rebase} />;
}

function EditLoading() {
  return (
    <PixelAppShell>
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
  const [rebaseState, setRebaseState] = useState<'idle' | 'running' | 'failed' | 'unkept'>('idle');
  const [staleDialog, setStaleDialog] = useState(false);
  const [staleCopy, setStaleCopy] = useState<CopyResult>(null);
  const staleDiscardRef = useRef<HTMLButtonElement | null>(null);
  const command = useAnswerCommand(answerId);
  const pendingOnEntry = usePendingAnswer(answerId);
  const { view } = command;
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const [settledText, setSettledText] = useState<string | null>(null);
  const [copyResult, setCopyResult] = useState<CopyResult>(null);
  const [discardDialog, setDiscardDialog] = useState(false);
  const [leaveDialog, setLeaveDialog] = useState(false);
  const allowLeaveRef = useRef(false);
  const discardButtonRef = useRef<HTMLButtonElement | null>(null);
  // Edited during this visit: "바뀐 내용이 없어요." keeps its reason after the equal draft is removed.
  const [edited, setEdited] = useState(false);

  const viewKind = view.kind;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on every save-state change.
  useEffect(() => {
    setCopyResult(null);
  }, [viewKind]);

  // A confirmed edit returns to F21, which announces it once (IX-029). No F12, no haptic.
  useEffect(() => {
    if (view.kind !== 'succeeded') return;
    allowLeaveRef.current = true;
    routerNavigate(-1);
  }, [view.kind, routerNavigate]);

  const text = settledText ?? draft.text;
  const unchanged = draft.text === base.content;
  // Back to the server text: the edit draft is not needed any more (IX-024).
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  useEffect(() => {
    if (unchanged && draft.status.kind === 'persisted') void latestDraft.current.discard(base.content);
  }, [unchanged, draft.status.kind, base.content]);

  const busy = view.kind === 'working';
  const pending = busy || view.kind === 'unconfirmed' || pendingOnEntry === 'checking';
  const draftKept = draft.status.kind === 'persisted' || draft.status.kind === 'clean';
  const trackerKept = (view.kind === 'working' || view.kind === 'unconfirmed') && view.trackerKept;
  const canLeaveWhilePending = (busy || view.kind === 'unconfirmed') && draftKept && trackerKept;

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowLeaveRef.current || currentLocation.pathname === nextLocation.pathname) return false;
    if (busy || view.kind === 'unconfirmed') return !canLeaveWhilePending;
    return !draftKept && !unchanged;
  });
  const latest = useRef({ pending: busy || view.kind === 'unconfirmed', flush: draft.flush, blocker });
  latest.current = { pending: busy || view.kind === 'unconfirmed', flush: draft.flush, blocker };
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (latest.current.pending) {
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

  const measured = measureAnswer(text);
  const overflow = measured.overCount > 0;
  const loading = draft.load.kind === 'loading';
  const unreadable = draft.load.kind === 'unreadable';

  const onSave = () => {
    if (!measured.savable || unchanged || composingRef.current || busy) return;
    setCopyResult(null);
    command.saveEdit({ mode: 'UPDATE', answerId, expectedRevision: base.revision }, draft.flushKept);
  };

  const onLeave = () => {
    // Unchanged text leaves no edit draft behind (IX-024).
    if (unchanged && !pending) void draft.discard(base.content);
    routerNavigate(-1);
  };

  const onCopy = async () => {
    const result = await copyText(draft.text);
    setCopyResult(result.kind);
    if (result.kind === 'failed') textareaRef.current?.focus();
  };

  // One live message per IX-037: primary save problem → device-keeping state → copy result.
  const keepFailed = unreadable || draft.status.kind === 'failed';
  const keepUnsettled = draft.status.kind === 'persisting' || draft.status.kind === 'editing';
  const closedByUser = view.kind === 'notApplied' && view.code === 'COMMAND_CLOSED';
  const saveProblem = (view.kind === 'notApplied' && !closedByUser) || view.kind === 'rejected';
  // The base revision is gone (edited or deleted elsewhere): a retry on it can only fail again. The
  // text stays for copying; the latest detail is on F21 (MS-EDIT-002).
  const baseGone =
    (view.kind === 'notApplied' || view.kind === 'rejected') &&
    (view.code === 'REVISION_CONFLICT' || view.code === 'ANSWER_NOT_FOUND');
  // Changed elsewhere: the latest detail becomes the next base on request; the texts never mix (MS-EDIT-002).
  const conflict = (view.kind === 'notApplied' || view.kind === 'rejected') && view.code === 'REVISION_CONFLICT';
  useEffect(() => {
    if (conflict) markStale();
  }, [conflict, markStale]);

  const onReEdit = async () => {
    // The old input stays as the old base's draft; without a confirmed keep, warn once first.
    if (rebaseState !== 'unkept' && !(await draft.flush())) {
      setRebaseState('unkept');
      return;
    }
    setRebaseState('running');
    const result = await onRebase();
    if (result === 'rebased') {
      allowLeaveRef.current = true;
      command.consume();
      return;
    }
    if (result === 'gone') {
      allowLeaveRef.current = true;
      command.consume();
      routerNavigate(-1);
      return;
    }
    setRebaseState('failed');
  };
  const statusParts: string[] = [];
  if (loading) statusParts.push(copy['CPY-F22-009']);
  switch (view.kind) {
    case 'working':
      statusParts.push(view.stage === 'confirming' ? copy['CPY-F22-019'] : copy['CPY-F22-015']);
      break;
    case 'unconfirmed':
      if (view.recovery === 'cleanUpExpired') {
        statusParts.push(copy['CPY-COM-022']);
        if (keepFailed) statusParts.push(copy['CPY-F22-012']);
        else if (keepUnsettled) statusParts.push(copy['CPY-COM-008']);
        break;
      }
      statusParts.push(copy['CPY-F22-020']);
      if (keepFailed) statusParts.push(copy['CPY-F22-030']);
      else if (keepUnsettled) statusParts.push(copy['CPY-COM-008']);
      else if (!view.trackerKept) statusParts.push(copy['CPY-F11-042']);
      else statusParts.push(copy['CPY-F22-029']);
      break;
    case 'notApplied':
    case 'rejected':
      if (conflict) {
        statusParts.push(copy['CPY-F22-034']);
        if (rebaseState === 'failed') statusParts.push(copy['CPY-F21-011']);
        if (rebaseState === 'unkept') statusParts.push(copy['CPY-COM-008']);
        break;
      }
      statusParts.push(closedByUser ? copy['CPY-COM-021'] : copy['CPY-F22-016']);
      if (keepFailed) statusParts.push(copy['CPY-F22-012']);
      else if (keepUnsettled) statusParts.push(copy['CPY-COM-008']);
      break;
    case 'localFailure':
      statusParts.push(copy['CPY-F22-012']);
      break;
    case 'reconciled':
      if (keepFailed) statusParts.push(copy['CPY-F22-012']);
      break;
    default:
      if (keepFailed) statusParts.push(copy['CPY-F22-012']);
      else if (unchanged && edited) statusParts.push(copy['CPY-F22-013']);
      else if (draft.load.kind === 'ready' && draft.load.restored && !unchanged && draft.status.kind === 'clean') {
        statusParts.push(copy['CPY-F22-011']);
      }
  }
  if (copyResult === 'copied') statusParts.push(copy['CPY-F13-014']);
  if (copyResult === 'failed') statusParts.push(copy['CPY-F13-015']);
  const status = statusParts.length > 0 ? statusParts.join(' ') : null;
  const dangerStatus =
    (saveProblem && !conflict) ||
    rebaseState === 'failed' ||
    rebaseState === 'unkept' ||
    keepFailed ||
    copyResult === 'failed' ||
    view.kind === 'localFailure';
  const showCopy = pending || keepFailed || saveProblem;
  const textLocked = pending || view.kind === 'reconciled';
  const helpId = 'f22-help';

  return (
    <PixelAppShell>
      <div className="arca-screen-header">
        <PixelIconButton label={copy['CPY-COM-005']} glyph="‹" buttonRef={backButtonRef} onClick={onLeave} />
        <ScreenTitle>{copy['CPY-F22-001']}</ScreenTitle>
      </div>
      <ScenePanel labelledBy="f22-question-label">
        <p className="arca-label" id="f22-question-label">
          {copy['CPY-F22-002']}
        </p>
        <p className="arca-question">{base.question.text}</p>
        <p className="arca-text-secondary">
          {fill(copy['CPY-F21-006'], { createdDateKst: formatDateKst(base.createdDateKst) })}
        </p>
      </ScenePanel>
      <RecordPanel>
        <p className="arca-text-secondary" id="f22-privacy">
          {copy['CPY-F22-005']} {copy['CPY-F22-006']}
        </p>
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
              onCompositionStart={() => {
                composingRef.current = true;
                setSettledText(draft.text);
              }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                setSettledText(null);
                draft.compositionEnd(event.currentTarget.value);
              }}
              onChange={(event) => {
                setEdited(true);
                draft.change(event.currentTarget.value, composingRef.current);
              }}
            />
            <div className="arca-field-help" id={helpId}>
              <span>{keepLabel(draft.status) ?? ''}</span>
              <span>{fill(copy['CPY-F22-007'], { currentCount: formatCount(measured.count) })}</span>
            </div>
            {overflow && (
              <p className="arca-field-error" id="f22-error">
                {fill(copy['CPY-F22-008'], { overCount: formatCount(measured.overCount) })}
              </p>
            )}
          </>
        )}
      </RecordPanel>
      <InlineStatus message={status} tone={dangerStatus ? 'danger' : 'neutral'} />
      {stale && !pending && (
        <RecordPanel labelledBy="f22-stale-label">
          <p className="arca-text-secondary" id="f22-stale-label">
            {copy['CPY-F22-036']}
          </p>
          <p className="arca-user-text">{stale.text}</p>
          <InlineStatus
            message={staleCopy === 'copied' ? copy['CPY-F13-014'] : staleCopy === 'failed' ? copy['CPY-F13-015'] : null}
            tone={staleCopy === 'failed' ? 'danger' : 'neutral'}
          />
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
          <PixelButton
            variant="primary"
            onClick={() => {
              allowLeaveRef.current = true;
              command.consume();
              routerNavigate(-1);
            }}
          >
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
          // Only the edit draft goes; the saved answer stays as it is (IX-024).
          void draft.discard(base.content).then(() => {
            allowLeaveRef.current = true;
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
          // Only the other-base draft goes; the current input and the saved answer stay.
          // Removed: back to the input. Not removed: the panel stays and focus returns to its action.
          void stale?.remove().then((removed) => (removed ? textareaRef : staleDiscardRef).current?.focus());
        }}
      />
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
