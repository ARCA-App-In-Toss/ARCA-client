import { useState } from 'react';
import { type BoardingPolicy, useBoarding } from '../../app/AppServices.tsx';
import {
  InlineStatus,
  InsetPanel,
  PixelAppShell,
  PixelButton,
  PixelCheckboxRow,
  ScreenTitle,
} from '../../ui/components.tsx';
import { type CopyId, copy } from '../../ui/copy.ts';

// F02 (03 §4.3, 04 §6.3, IX-031). Two independent required consents, the recovery limit before
// consent, then one OP-003 that creates consent records and passenger together. Success re-routes to
// F03 via the app snapshot; failure keeps both selections, scroll and focus.

const policyCopy: Record<string, { label: CopyId; open: CopyId; name: CopyId }> = {
  'terms-of-service': { label: 'CPY-F02-004', open: 'CPY-F02-007', name: 'CPY-F02-015' },
  'privacy-policy': { label: 'CPY-F02-005', open: 'CPY-F02-008', name: 'CPY-F02-016' },
};

/** Unknown policy IDs fall back to the server title; real IDs are a launch input (03 §4.3). */
function textsFor(policy: BoardingPolicy) {
  const known = policyCopy[policy.policyId];
  if (known) return { label: copy[known.label], open: copy[known.open], name: copy[known.name] };
  return { label: policy.title, open: policy.title, name: `${copy['CPY-F02-006']}, ${policy.title}` };
}

/** Agreement is to an exact version: a changed version is not pre-checked (05 §6.2). */
const agreementKey = (p: BoardingPolicy) => `${p.policyId}\u0000${p.version}`;

type Status = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'message'; id: CopyId };

export function BoardingScreen() {
  const { policies, submit, openPolicy } = useBoarding();
  const [agreed, setAgreed] = useState<ReadonlySet<string>>(() => new Set());
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const allAgreed = policies.length > 0 && policies.every((p) => agreed.has(agreementKey(p)));
  const submitting = status.kind === 'submitting';

  const toggle = (policy: BoardingPolicy, checked: boolean) => {
    const next = new Set(agreed);
    if (checked) next.add(agreementKey(policy));
    else next.delete(agreementKey(policy));
    setAgreed(next);
  };

  const board = async () => {
    if (!allAgreed || submitting) return;
    setStatus({ kind: 'submitting' });
    const result = await submit(policies.map(({ policyId, version }) => ({ policyId, version })));
    if (result.kind === 'failed') {
      setStatus({ kind: 'message', id: result.reason === 'offline' ? 'CPY-F02-013' : 'CPY-F02-012' });
    }
  };

  const open = async (policyId: string) => {
    const result = await openPolicy(policyId);
    if (result.kind === 'unavailable') setStatus({ kind: 'message', id: 'CPY-F02-014' });
  };

  const message =
    status.kind === 'submitting' ? copy['CPY-F02-011'] : status.kind === 'message' ? copy[status.id] : null;

  return (
    <PixelAppShell>
      <ScreenTitle>{copy['CPY-F02-001']}</ScreenTitle>
      <p className="arca-narrative">{copy['CPY-F02-002']}</p>
      <InsetPanel>
        <p className="arca-text-secondary">{copy['CPY-F02-003']}</p>
      </InsetPanel>
      {policies.map((policy) => {
        const texts = textsFor(policy);
        return (
          <div key={policy.policyId} className="arca-consent">
            <PixelCheckboxRow
              id={`arca-consent-${policy.policyId}`}
              label={texts.label}
              badge={copy['CPY-F02-006']}
              accessibleName={texts.name}
              checked={agreed.has(agreementKey(policy))}
              onChange={(checked) => toggle(policy, checked)}
            />
            <PixelButton variant="ghost" onClick={() => void open(policy.policyId)}>
              {texts.open}
            </PixelButton>
          </div>
        );
      })}
      <InlineStatus message={message} tone={status.kind === 'message' ? 'danger' : 'neutral'} />
      <div className="arca-actions">
        {allAgreed ? null : (
          <p id="arca-boarding-reason" className="arca-text-secondary">
            {copy['CPY-F02-009']}
          </p>
        )}
        <PixelButton
          variant="primary"
          loading={submitting}
          aria-disabled={!allAgreed || submitting || undefined}
          aria-describedby={allAgreed ? undefined : 'arca-boarding-reason'}
          onClick={() => void board()}
        >
          {copy['CPY-F02-010']}
        </PixelButton>
      </div>
    </PixelAppShell>
  );
}
