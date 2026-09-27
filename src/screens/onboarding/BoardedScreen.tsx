import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { useBoardedPassenger, useFinishBoarding, useNicknameSave } from '../../app/AppServices.tsx';
import { paths, useArcaNavigate } from '../../app/navigation.ts';
import { checkNickname, type NicknameError } from '../../domain/text/nickname.ts';
import {
  InlineStatus,
  InsetPanel,
  PixelAppShell,
  PixelButton,
  PixelTextField,
  ScreenTitle,
} from '../../ui/components.tsx';
import { type CopyId, copy, fill } from '../../ui/copy.ts';

// F03 (03 §4.4, 04 §6.4, IX-001~003·035). Boarding is already complete and never undone here. One
// Primary: an empty nickname proceeds with no request, a valid one proceeds after OP-004 succeeds.
// Only a definite failure or an unsent offline attempt adds the explicit "continue without" action.

const errorCopy: Record<NicknameError, CopyId> = {
  'too-short': 'CPY-F03-010',
  'too-long': 'CPY-F03-011',
  forbidden: 'CPY-F03-012',
};

type Problem = { id: CopyId; skippable: boolean; tone: 'danger' | 'neutral' };

export function BoardedScreen() {
  const passenger = useBoardedPassenger();
  const save = useNicknameSave();
  const navigate = useArcaNavigate();
  const finishBoarding = useFinishBoarding();

  const [value, setValue] = useState('');
  /** Value as of the last non-composing change; IME intermediate text is never judged (IX-001). */
  const [committed, setCommitted] = useState('');
  const composing = useRef(false);
  const [shortRevealed, setShortRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Read synchronously by the blocker so the post-save move is never blocked by a stale render. */
  const savingRef = useRef(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  // 04 §6.4: Back and other route changes are locked while OP-004 is in flight.
  const blocker = useBlocker(() => savingRef.current);
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  const check = checkNickname(committed);
  // Forbidden/over-limit show right after composition; one character waits for blur or an attempt (04 §4.2).
  const visibleError = check.error === 'too-short' && !shortRevealed ? null : check.error;

  const toToday = () => {
    navigate(paths.today, {}, { replace: true });
    finishBoarding();
  };

  const commit = (next: string) => {
    setCommitted(next);
    setAnnouncement(null);
  };

  const proceed = async () => {
    if (saving || composing.current) return;
    const current = checkNickname(value);
    if (current.empty) return toToday();
    if (current.error) {
      setShortRevealed(true);
      setAnnouncement(copy[errorCopy[current.error]]);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setProblem(null);
    const result = await save(current.normalized);
    savingRef.current = false;
    setSaving(false);
    if (result.kind === 'saved') return toToday();
    if (result.kind === 'unsent') setProblem({ id: 'CPY-F03-017', skippable: true, tone: 'danger' });
    else if (result.kind === 'rejected') setProblem({ id: 'CPY-F03-015', skippable: true, tone: 'danger' });
    else if (result.kind === 'expired') {
      // The old key is sealed: show the current profile and let the next save be a new action (IX-035).
      const current = result.currentNickname ?? '';
      setValue(current);
      setCommitted(current);
      setProblem({ id: 'CPY-F11-044', skippable: false, tone: 'neutral' });
    }
    // Unconfirmed is not a failure (IX-035, 04 §7.0): the adopted "save not confirmed" string, no failure
    // tone and no skip; the Primary retries the same input with the same key.
    else setProblem({ id: 'CPY-F11-044', skippable: false, tone: 'neutral' });
  };

  const status = saving ? copy['CPY-F03-014'] : problem ? copy[problem.id] : announcement;
  const describedBy = `f03-help f03-count${visibleError ? ' f03-error' : ''}`;

  return (
    <PixelAppShell>
      <ScreenTitle>{copy['CPY-F03-001']}</ScreenTitle>
      <p className="arca-narrative">{copy['CPY-F03-002']}</p>
      <InsetPanel>
        <dl className="arca-code">
          <div className="arca-code__pair">
            <dt className="arca-code__label">{copy['CPY-F03-003']}</dt>
            <dd className="arca-code__value">
              {passenger.data ? fill(copy['CPY-F03-004'], { passengerCode: passenger.data.passengerCode }) : ''}
            </dd>
          </div>
        </dl>
      </InsetPanel>
      <PixelTextField
        id="f03-nickname"
        label={
          <>
            {copy['CPY-F03-005']} <span className="arca-text-secondary">{copy['CPY-F03-006']}</span>
          </>
        }
        aria-label={copy['CPY-F03-018']}
        placeholder={copy['CPY-F03-007']}
        describedBy={describedBy}
        invalid={visibleError !== null}
        value={value}
        readOnly={saving}
        enterKeyHint="go"
        autoComplete="off"
        onChange={(event) => {
          setValue(event.target.value);
          if (!composing.current) commit(event.target.value);
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          commit(event.currentTarget.value);
        }}
        onBlur={() => {
          if (checkNickname(value).error === 'too-short') setShortRevealed(true);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing || composing.current) return;
          event.preventDefault();
          void proceed();
        }}
      />
      <div className="arca-field-help">
        <span id="f03-help">{copy['CPY-F03-008']}</span>
        <span id="f03-count">{fill(copy['CPY-F03-009'], { currentCount: String(check.count) })}</span>
      </div>
      {visibleError ? (
        <p className="arca-field-error" id="f03-error">
          {copy[errorCopy[visibleError]]}
        </p>
      ) : null}
      <InlineStatus message={status} tone={problem?.tone ?? 'neutral'} />
      <div className="arca-actions">
        <PixelButton
          variant="primary"
          loading={saving}
          aria-disabled={visibleError !== null || undefined}
          onClick={() => void proceed()}
        >
          {copy['CPY-F03-013']}
        </PixelButton>
        {problem?.skippable ? (
          <PixelButton loading={saving} onClick={toToday}>
            {copy['CPY-F03-019']}
          </PixelButton>
        ) : null}
      </div>
    </PixelAppShell>
  );
}
