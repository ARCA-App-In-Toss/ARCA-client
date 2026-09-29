import { useRef, useState } from 'react';
import type { StartErrorKind } from '../../app/bootstrap/bootstrap.ts';
import { useAppSnapshot, useStartActions } from '../../app/hooks/start.ts';
import { InlineStatus, PixelAppShell, PixelButton, ScreenTitle, StatePanel } from '../../ui/components.tsx';
import { copy } from '../../ui/copy.ts';

const messageFor: Record<StartErrorKind, string> = {
  general: copy['CPY-F90-002'],
  offline: copy['CPY-F90-003'],
  maintenance: copy['CPY-F90-004'],
};

type LocalStatus = 'copied' | 'copy-failed' | 'support-failed' | null;

const localMessage: Record<Exclude<LocalStatus, null>, string> = {
  copied: copy['CPY-F90-012'],
  'copy-failed': copy['CPY-F90-013'],
  'support-failed': copy['CPY-F90-014'],
};

function startErrorStatus(
  retry: 'idle' | 'running' | 'failed',
  local: LocalStatus,
): { message: string | null; danger: boolean } {
  if (retry === 'running') return { message: copy['CPY-F90-009'], danger: false };
  if (local !== null) return { message: localMessage[local], danger: false };
  if (retry === 'failed') return { message: copy['CPY-F90-010'], danger: true };
  return { message: null, danger: false };
}

export function StartErrorScreen() {
  const actions = useStartActions();
  const { bootstrap } = useAppSnapshot();
  const [local, setLocal] = useState<LocalStatus>(null);
  const codeRef = useRef<HTMLElement>(null);

  if (bootstrap.phase !== 'failed') return null;
  const { error, retry } = bootstrap;
  const retrying = retry === 'running';

  const status = startErrorStatus(retry, local);

  return (
    <PixelAppShell>
      <ScreenTitle>{copy['CPY-F90-001']}</ScreenTitle>
      <StatePanel>
        <p>{messageFor[error.kind]}</p>
        {error.safeErrorId !== null && (
          <div className="arca-code">
            <dl className="arca-code__pair">
              <dt className="arca-code__label">{copy['CPY-F90-005']}</dt>
              <dd ref={codeRef} className="arca-code__value" tabIndex={-1}>
                {error.safeErrorId}
              </dd>
            </dl>
            <PixelButton
              variant="ghost"
              onClick={async () => {
                const result = await actions.copySupportCode(error.safeErrorId ?? '');
                if (result.kind === 'copied') setLocal('copied');
                else {
                  setLocal('copy-failed');
                  codeRef.current?.focus();
                }
              }}
            >
              {copy['CPY-F90-011']}
            </PixelButton>
          </div>
        )}
      </StatePanel>
      <div className="arca-actions">
        <PixelButton
          variant="primary"
          loading={retrying}
          onClick={() => {
            setLocal(null);
            void actions.retryStart();
          }}
        >
          {copy['CPY-F90-007']}
        </PixelButton>
        <PixelButton
          onClick={async () => {
            const result = await actions.openSupport();
            setLocal(result.kind === 'opened' ? null : 'support-failed');
          }}
        >
          {copy['CPY-F90-008']}
        </PixelButton>
      </div>
      <InlineStatus message={status.message} tone={status.danger ? 'danger' : 'neutral'} />
    </PixelAppShell>
  );
}
