import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { useFinishBoarding } from '../../app/hooks/onboarding.ts';
import { useBoardedPassenger, useNicknameSave } from '../../app/hooks/passenger.ts';
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
import { usePendingReveal } from '../../ui/pendingReveal.ts';
import { type NicknameProblem, nicknameProblem, useNicknameInput } from '../shared/nickname.ts';

const errorCopy: Record<NicknameError, CopyId> = {
  'too-short': 'CPY-F03-010',
  'too-long': 'CPY-F03-011',
  forbidden: 'CPY-F03-012',
};

export function BoardedScreen() {
  const passenger = useBoardedPassenger();
  const save = useNicknameSave();
  const navigate = useArcaNavigate();
  const finishBoarding = useFinishBoarding();

  const [announcement, setAnnouncement] = useState<string | null>(null);
  const input = useNicknameInput(() => setAnnouncement(null));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [problem, setProblem] = useState<NicknameProblem | null>(null);
  const savingShown = usePendingReveal(saving);

  const blocker = useBlocker(() => savingRef.current);
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  const { visibleError } = input;

  const toToday = () => {
    navigate(paths.today, {}, { replace: true });
    finishBoarding();
  };

  const proceed = async () => {
    if (saving || input.composingRef.current) return;
    const current = checkNickname(input.value);
    if (current.empty) return toToday();
    if (current.error) {
      input.setShortRevealed(true);
      setAnnouncement(copy[errorCopy[current.error]]);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setProblem(null);
    const result = await save(current.normalized);
    savingRef.current = false;
    if (result.kind === 'saved') return toToday();
    setSaving(false);
    if (result.kind === 'expired') input.replace(result.currentNickname ?? '');
    setProblem(nicknameProblem(result, { unsent: 'CPY-F03-017', rejected: 'CPY-F03-015' }));
  };

  const status = savingShown ? copy['CPY-F03-014'] : problem ? copy[problem.id] : announcement;
  const describedBy = `f03-help f03-count${visibleError ? ' f03-error' : ''}`;

  return (
    <PixelAppShell className="arca-page--cta">
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
      <div className="arca-field-group">
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
          value={input.value}
          readOnly={saving}
          enterKeyHint="go"
          autoComplete="off"
          {...input.fieldHandlers(() => void proceed())}
        />
        <div className="arca-field-help">
          <span id="f03-help">{copy['CPY-F03-008']}</span>
          <span id="f03-count">{fill(copy['CPY-F03-009'], { currentCount: String(input.currentCount) })}</span>
        </div>
        {visibleError ? (
          <p className="arca-field-error" id="f03-error">
            {copy[errorCopy[visibleError]]}
          </p>
        ) : null}
      </div>
      <div className="arca-cta-bottom">
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
          {problem?.failed ? (
            <PixelButton loading={saving} onClick={toToday}>
              {copy['CPY-F03-019']}
            </PixelButton>
          ) : null}
        </div>
      </div>
    </PixelAppShell>
  );
}
