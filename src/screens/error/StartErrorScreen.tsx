import { useRef, useState } from 'react';
import { useAppSnapshot, useStartActions } from '../../app/AppServices.tsx';
import type { StartErrorKind } from '../../app/bootstrap/bootstrap.ts';
import { InlineStatus, PixelAppShell, PixelButton, ScreenTitle, StatePanel } from '../../ui/components.tsx';
import { copy } from '../../ui/copy.ts';

const messageFor: Record<StartErrorKind, string> = {
  general: copy['CPY-F90-002'],
  offline: copy['CPY-F90-003'],
  maintenance: copy['CPY-F90-004'],
};

type LocalStatus = 'copied' | 'copy-failed' | 'support-failed' | null;

/** F90 — start error (03 §7.3, 04 §6.15). Creates no data; reconnect repeats the F00 judgement. */
export function StartErrorScreen() {
  const actions = useStartActions();
  const { bootstrap } = useAppSnapshot();
  const [local, setLocal] = useState<LocalStatus>(null);
  const codeRef = useRef<HTMLElement>(null);

  if (bootstrap.phase !== 'failed') return null;
  const { error, retry } = bootstrap;
  const retrying = retry === 'running';

  // One live source for the region (02 §12.4): retry progress wins, then the latest local result.
  const status =
    retry === 'running'
      ? copy['CPY-F90-009']
      : local === 'copied'
        ? copy['CPY-F90-012']
        : local === 'copy-failed'
          ? copy['CPY-F90-013']
          : local === 'support-failed'
            ? copy['CPY-F90-014']
            : retry === 'failed'
              ? copy['CPY-F90-010']
              : null;

  return (
    <PixelAppShell>
      <ScreenTitle>{copy['CPY-F90-001']}</ScreenTitle>
      <StatePanel>
        <p>{messageFor[error.kind]}</p>
        {error.safeErrorId !== null && (
          <div className="arca-code">
            <dl className="arca-code__pair">
              <dt className="arca-code__label">{copy['CPY-F90-005']}</dt>
              {/* Directly selectable so copy failure still leaves a manual path (04 IX-040). */}
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
      <InlineStatus
        message={status}
        tone={retry === 'failed' && status === copy['CPY-F90-010'] ? 'danger' : 'neutral'}
      />
    </PixelAppShell>
  );
}
