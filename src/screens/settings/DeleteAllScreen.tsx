import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router';
import { useAllDataDelete, useAppSnapshot } from '../../app/AppServices.tsx';
import { paths, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import {
  InlineStatus,
  InsetPanel,
  PixelAppShell,
  PixelButton,
  PixelIconButton,
  RecordPanel,
  ScreenTitle,
} from '../../ui/components.tsx';
import { type CopyId, copy } from '../../ui/copy.ts';
import { PixelAlertDialog } from '../../ui/PixelAlertDialog.tsx';

// F31 — all-data delete in two steps (03 §7.2, 04 §6.14, IX-026·036·041). The page is the reading
// context; the AlertDialog is only the last confirmation. Nothing is removed before the server's
// SUCCEEDED; the app then moves to F01 on its own (06 §9.4).

export function DeleteAllScreen() {
  const { view, ...deletion } = useAllDataDelete();
  const { session } = useAppSnapshot();
  const routeState = useRouteState();
  const routerNavigate = useNavigate();
  const navigate = useArcaNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  // The restricted gate, or a server success whose device cleanup is not confirmed yet: F31 is the
  // only place until the old area is gone (06 §9.4).
  const recovery = session?.mode === 'DELETION_RECOVERY' || view.kind === 'cleanupFailed' || view.kind === 'finished';
  const working = view.kind === 'working';

  // The server result comes before the plain page (IX-036 #5); in the gate it is the only work.
  useEffect(() => {
    deletion.enter();
  }, [deletion.enter]);

  // A settled failure closes the dialog: the page keeps the context and the retry (IX-026).
  useEffect(() => {
    if (view.kind === 'blocked' || view.kind === 'unsent' || view.kind === 'notApplied' || view.kind === 'failed') {
      setDialogOpen(false);
    }
    if (view.kind === 'prepared' || view.kind === 'cleanupFailed') setDialogOpen(false);
  }, [view.kind]);

  // Running: no Back/dismiss. In the recovery gate there is nowhere else to go (06 §5.3 #4).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (currentLocation.pathname === nextLocation.pathname) return false;
    return working || recovery;
  });
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  const leave = () => {
    if (working || recovery) return;
    deletion.leave();
    if (routeState) routerNavigate(-1);
    else navigate(paths.settings, {}, { replace: true });
  };

  let status: CopyId | null = null;
  let tone: 'danger' | 'neutral' = 'neutral';
  switch (view.kind) {
    case 'working':
      status = dialogOpen ? null : 'CPY-F31-015';
      break;
    case 'blocked':
      status = 'CPY-F31-030';
      tone = 'danger';
      break;
    case 'unsent':
      status = 'CPY-F31-017';
      tone = 'danger';
      break;
    case 'notApplied':
      status = view.code === 'COMMAND_CLOSED' ? 'CPY-COM-027' : 'CPY-F31-016';
      tone = view.code === 'COMMAND_CLOSED' ? 'neutral' : 'danger';
      break;
    case 'failed':
    case 'cleanupFailed':
      status = 'CPY-F31-016';
      tone = 'danger';
      break;
    case 'unconfirmed':
      status = dialogOpen ? null : view.recovery ? 'CPY-COM-028' : 'CPY-F31-027';
      break;
    default:
      status = null;
  }

  // Dialog content by state: confirm → running → unconfirmed (recheck / explicit cleanup).
  let dialogStatus: string | null = null;
  let actionLabel: string = copy['CPY-F31-014'];
  let cancelLabel: string = copy['CPY-F31-013'];
  let onAction = () => deletion.start();
  if (working) dialogStatus = copy['CPY-F31-015'];
  if (view.kind === 'unconfirmed') {
    cancelLabel = copy['CPY-F31-028'];
    if (view.recovery === 'cleanUpExpired') {
      dialogStatus = copy['CPY-COM-028'];
      actionLabel = copy['CPY-COM-023'];
      onAction = () => deletion.close();
    } else {
      dialogStatus = copy['CPY-F31-027'];
      actionLabel = copy['CPY-COM-007'];
      onAction = () => (session?.mode === 'DELETION_RECOVERY' ? deletion.retryRecovery() : deletion.recheck());
    }
  }
  if (view.kind === 'prepared') onAction = () => deletion.executePrepared();
  const unconfirmed = view.kind === 'unconfirmed';
  const settledFailure =
    view.kind === 'notApplied' || view.kind === 'failed' || view.kind === 'unsent' || view.kind === 'blocked';

  // The failure notice stays on the page until the user actually starts again (IX-026).
  const openDialog = () => setDialogOpen(true);

  return (
    <PixelAppShell>
      <div className="arca-screen-header">
        {!recovery && <PixelIconButton label={copy['CPY-COM-005']} glyph="‹" onClick={leave} />}
        <ScreenTitle>{copy['CPY-F31-001']}</ScreenTitle>
      </div>
      <RecordPanel labelledBy="f31-scope">
        <h2 className="arca-label" id="f31-scope">
          {copy['CPY-F31-002']}
        </h2>
        <ul className="arca-list">
          <li>{copy['CPY-F31-020']}</li>
          <li>{copy['CPY-F31-021']}</li>
          <li>{copy['CPY-F31-022']}</li>
        </ul>
      </RecordPanel>
      <InsetPanel>
        <h2 className="arca-label">{copy['CPY-F31-004']}</h2>
        <p className="arca-text-secondary">{copy['CPY-F31-023']}</p>
        <ul className="arca-list">
          <li>{copy['CPY-F31-024']}</li>
          <li>{copy['CPY-F31-025']}</li>
        </ul>
        <p className="arca-text-secondary">{copy['CPY-F31-026']}</p>
      </InsetPanel>
      <InsetPanel>
        <h2 className="arca-label">{copy['CPY-F31-006']}</h2>
        <p className="arca-text-secondary">{copy['CPY-F31-007']}</p>
      </InsetPanel>
      <p className="arca-user-text">{copy['CPY-F31-008']}</p>
      {/* Filled only once the dialog is closed: the background is hidden from AT while it is open. */}
      <InlineStatus message={status && !dialogOpen ? copy[status] : null} tone={tone} />
      <div className="arca-actions">
        {!recovery && (
          <PixelButton disabled={working} onClick={leave}>
            {copy['CPY-F31-009']}
          </PixelButton>
        )}
        {view.kind === 'prepared' && <PixelButton onClick={() => deletion.close()}>{copy['CPY-COM-026']}</PixelButton>}
        {view.kind === 'cleanupFailed' ? (
          <PixelButton variant="danger" onClick={() => deletion.retryCleanup()}>
            {copy['CPY-F31-018']}
          </PixelButton>
        ) : (
          <PixelButton ref={openerRef} variant="danger" disabled={working && !dialogOpen} onClick={openDialog}>
            {view.kind === 'unconfirmed' && view.recovery
              ? copy['CPY-COM-023']
              : unconfirmed
                ? copy['CPY-F31-029']
                : settledFailure
                  ? copy['CPY-F31-018']
                  : copy['CPY-F31-010']}
          </PixelButton>
        )}
      </div>
      <PixelAlertDialog
        open={dialogOpen}
        title={copy['CPY-F31-011']}
        description={copy['CPY-F31-012']}
        cancelLabel={cancelLabel}
        actionLabel={actionLabel}
        danger={!unconfirmed}
        locked={working}
        busy={working}
        status={dialogStatus}
        returnFocusRef={openerRef}
        onCancel={() => setDialogOpen(false)}
        onAction={onAction}
      />
    </PixelAppShell>
  );
}
