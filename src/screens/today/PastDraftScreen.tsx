import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useCopyText } from '../../app/hooks/device.ts';
import { usePastDraft } from '../../app/hooks/pastDrafts.ts';
import { paths, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
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
import { formatDateKst, formatInstantKst } from '../../ui/format.ts';
import { type CopyResult, copyResultMessage } from '../shared/compose.ts';

export function PastDraftScreen() {
  const routeState = useRouteState();
  const navigate = useArcaNavigate();
  const goBack = useNavigate();
  const copyText = useCopyText();
  const view = usePastDraft(routeState?.draftRef ?? null);
  const [copyResult, setCopyResult] = useState<CopyResult>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dateChanged = routeState?.pastDraftEntry === 'dateChanged';

  if (!routeState?.draftRef || view.kind === 'missing') return <Navigate to={paths.today} replace />;

  const toToday = () => navigate(paths.today);
  const header = (title: string) => (
    <div className="arca-screen-header">
      <PixelIconButton label={copy['CPY-COM-005']} icon="back" onClick={() => goBack(-1)} />
      <ScreenTitle>{title}</ScreenTitle>
    </div>
  );

  if (view.kind === 'expired') {
    return (
      <PixelAppShell>
        {header(copy['CPY-F13-017'])}
        <InlineStatus message={copy['CPY-F13-018']} />
        <div className="arca-actions">
          <PixelButton variant="primary" onClick={toToday}>
            {copy['CPY-F13-016']}
          </PixelButton>
        </div>
      </PixelAppShell>
    );
  }

  const title = dateChanged ? copy['CPY-F13-001'] : copy['CPY-F13-002'];
  if (view.kind === 'loading' || view.kind === 'unreadable') {
    return (
      <PixelAppShell>
        {header(title)}
        {view.kind === 'loading' ? <PixelPlaceholder /> : <InlineStatus message={copy['CPY-F10-033']} tone="danger" />}
        <div className="arca-actions">
          <PixelButton variant="primary" onClick={toToday}>
            {copy['CPY-F13-016']}
          </PixelButton>
        </div>
      </PixelAppShell>
    );
  }

  const onCopy = async () => {
    const result = await copyText(view.text);
    setCopyResult(result.kind);
    if (result.kind === 'failed') textareaRef.current?.focus();
  };

  const keepMessage =
    view.keep === 'kept' ? copy['CPY-F13-008'] : view.keep === 'failed' ? copy['CPY-F13-009'] : copy['CPY-COM-008'];
  const copyMessage = copyResultMessage(copyResult);
  const copyButton = (
    <PixelButton variant={dateChanged ? 'primary' : 'secondary'} onClick={() => void onCopy()}>
      {copyResult === 'failed' ? copy['CPY-F13-013'] : copy['CPY-F13-012']}
    </PixelButton>
  );
  const todayButton = (
    <PixelButton variant={dateChanged ? 'secondary' : 'primary'} onClick={toToday}>
      {copy['CPY-F13-016']}
    </PixelButton>
  );

  return (
    <PixelAppShell>
      {header(title)}
      <ScenePanel labelledBy="f13-question-label">
        <p className="arca-text-secondary">{dateChanged ? copy['CPY-F13-003'] : copy['CPY-F13-004']}</p>
        {view.context && (
          <>
            <p className="arca-label">{copy['CPY-F13-005']}</p>
            <p>{formatDateKst(view.context.dateKst)}</p>
          </>
        )}
        <p className="arca-label" id="f13-question-label">
          {copy['CPY-F13-006']}
        </p>
        {view.context && <p className="arca-question">{view.context.questionText}</p>}
      </ScenePanel>
      <RecordPanel>
        <PixelTextareaField
          textareaRef={textareaRef}
          id="f13-text"
          label={copy['CPY-F13-007']}
          describedBy="f13-keep"
          invalid={false}
          value={view.text}
          readOnly
        />
        <p className="arca-field-help" id="f13-keep">
          {keepMessage}
          {view.keep === 'kept' && view.expiresAt !== null && (
            <> {fill(copy['CPY-F13-010'], { expiresAtKst: formatInstantKst(view.expiresAt) })}</>
          )}
        </p>
      </RecordPanel>
      <InlineStatus message={copyMessage} tone={copyResult === 'failed' ? 'danger' : 'neutral'} />
      <div className="arca-actions">
        {dateChanged ? (
          <>
            {copyButton}
            {todayButton}
          </>
        ) : (
          <>
            {todayButton}
            {copyButton}
          </>
        )}
      </div>
    </PixelAppShell>
  );
}
