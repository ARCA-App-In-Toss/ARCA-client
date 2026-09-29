import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router';
import { useAllDataDelete } from '../../app/hooks/settings.ts';
import { useAppSnapshot } from '../../app/hooks/start.ts';
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
import { copy } from '../../ui/copy.ts';
import { PixelAlertDialog } from '../../ui/PixelAlertDialog.tsx';
import { closesDialog, deleteDialogContent, openerLabel, pageStatus } from './deleteAllStatus.ts';

export function DeleteAllScreen() {
  const { view, ...deletion } = useAllDataDelete();
  const { session } = useAppSnapshot();
  const routeState = useRouteState();
  const routerNavigate = useNavigate();
  const navigate = useArcaNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const recovery = session?.mode === 'DELETION_RECOVERY' || view.kind === 'cleanupFailed' || view.kind === 'finished';
  const working = view.kind === 'working';

  useEffect(() => {
    deletion.enter();
  }, [deletion.enter]);

  useEffect(() => {
    if (closesDialog(view.kind)) setDialogOpen(false);
  }, [view.kind]);

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

  const { id: status, tone } = pageStatus(view, dialogOpen);
  const dialog = deleteDialogContent(view, session?.mode === 'DELETION_RECOVERY');

  const openDialog = () => setDialogOpen(true);
  const pairedActions = !recovery && view.kind !== 'prepared' && view.kind !== 'unconfirmed';

  return (
    <PixelAppShell>
      <div className="arca-screen-header">
        {!recovery && <PixelIconButton label={copy['CPY-COM-005']} icon="back" onClick={leave} />}
        <ScreenTitle>{copy['CPY-F31-001']}</ScreenTitle>
      </div>
      <RecordPanel labelledBy="f31-scope">
        <h2 className="arca-label" id="f31-scope">
          {copy['CPY-F31-002']}
        </h2>
        <ul className="arca-list arca-list--bullets">
          <li>{copy['CPY-F31-020']}</li>
          <li>{copy['CPY-F31-021']}</li>
          <li>{copy['CPY-F31-022']}</li>
        </ul>
      </RecordPanel>
      <InsetPanel>
        <h2 className="arca-label">{copy['CPY-F31-004']}</h2>
        <p className="arca-text-secondary">{copy['CPY-F31-023']}</p>
        <ul className="arca-list arca-list--bullets">
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
      <InlineStatus message={status && !dialogOpen ? copy[status] : null} tone={tone} />
      <div className={pairedActions ? 'arca-actions arca-actions--pair' : 'arca-actions'}>
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
            {openerLabel(view)}
          </PixelButton>
        )}
      </div>
      <PixelAlertDialog
        open={dialogOpen}
        title={copy['CPY-F31-011']}
        description={copy['CPY-F31-012']}
        cancelLabel={dialog.cancelLabel}
        actionLabel={dialog.actionLabel}
        danger={view.kind !== 'unconfirmed'}
        pairActions={view.kind !== 'unconfirmed'}
        locked={working}
        busy={working}
        status={dialog.status}
        returnFocusRef={openerRef}
        onCancel={() => setDialogOpen(false)}
        onAction={() => deletion[dialog.action]()}
      />
    </PixelAppShell>
  );
}
