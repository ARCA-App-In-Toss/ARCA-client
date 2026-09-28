import { useState } from 'react';
import { type BoardingPolicy, useBoarding } from '../../app/AppServices.tsx';
import { InlineStatus, PixelAppShell, PixelButton, PixelCheckboxRow, ScreenTitle } from '../../ui/components.tsx';
import { type CopyId, copy } from '../../ui/copy.ts';
import { MemoryFragmentGlow } from '../../ui/pixel.tsx';

// F02 (03 §4.3, 04 §6.3, IX-031). Two independent required consents, the recovery limit before
// consent, then one OP-003 that creates consent records and passenger together. Success re-routes to
// F03 via the app snapshot; failure keeps both selections, scroll and focus.

const policyCopy: Record<string, { title: CopyId; open: CopyId; name: CopyId }> = {
  'terms-of-service': { title: 'CPY-F02-017', open: 'CPY-F02-007', name: 'CPY-F02-015' },
  'privacy-policy': { title: 'CPY-F02-018', open: 'CPY-F02-008', name: 'CPY-F02-016' },
};

/**
 * The policy name is the underlined link that opens its full text; the rest of the label toggles the
 * checkbox. Unknown policy IDs fall back to the server title; real IDs are a launch input (03 §4.3).
 */
function textsFor(policy: BoardingPolicy) {
  const known = policyCopy[policy.policyId];
  if (known) return { title: copy[known.title], open: copy[known.open], name: copy[known.name] };
  return { title: policy.title, open: policy.title, name: `${copy['CPY-F02-006']}, ${policy.title}` };
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
    <PixelAppShell className="arca-page--cta">
      <ScreenTitle>{copy['CPY-F02-001']}</ScreenTitle>
      <p className="arca-narrative">{copy['CPY-F02-002']}</p>
      {/* The memory fragment the passenger will keep, softly breathing; decorative, centred in the free space. */}
      <div className="arca-cta-hero">
        <MemoryFragmentGlow />
      </div>
      {/* Consent, the recovery limit and the Primary sit together at the bottom (03 §4.3). */}
      <div className="arca-cta-bottom">
        <div className="arca-consent-group arca-plain-small">
          {policies.map((policy) => {
            const texts = textsFor(policy);
            return (
              <div key={policy.policyId} className="arca-consent">
                <PixelCheckboxRow
                  id={`arca-consent-${policy.policyId}`}
                  label={copy['CPY-F02-019']}
                  badge={copy['CPY-F02-006']}
                  accessibleName={texts.name}
                  link={{ text: texts.title, accessibleName: texts.open, onOpen: () => void open(policy.policyId) }}
                  checked={agreed.has(agreementKey(policy))}
                  onChange={(checked) => toggle(policy, checked)}
                />
              </div>
            );
          })}
        </div>
        <InlineStatus message={message} tone={status.kind === 'message' ? 'danger' : 'neutral'} />
        <div className="arca-actions">
          {/* The recovery limit sits right above the consent action so it is read before boarding (03 §4.3). */}
          <p className="arca-caption arca-text-secondary">{copy['CPY-F02-003']}</p>
          {/* The disabled reason stays for assistive tech only; sighted users see the inactive button. */}
          {allAgreed ? null : (
            <p id="arca-boarding-reason" className="arca-visually-hidden">
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
      </div>
    </PixelAppShell>
  );
}
