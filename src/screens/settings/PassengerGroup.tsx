import { useEffect, useRef, useState } from 'react';
import { useNicknameSave } from '../../app/hooks/passenger.ts';
import { checkNickname, type NicknameError } from '../../domain/text/nickname.ts';
import { InlineStatus, PixelButton, PixelTextField } from '../../ui/components.tsx';
import { type CopyId, copy, fill } from '../../ui/copy.ts';
import { type NicknameProblem, nicknameProblem, useNicknameInput } from '../shared/nickname.ts';

const errorCopy: Record<NicknameError, CopyId> = {
  'too-short': 'CPY-F30-012',
  'too-long': 'CPY-F30-013',
  forbidden: 'CPY-F30-014',
};

export function PassengerGroup({ passengerCode, nickname }: { passengerCode: string; nickname: string | null }) {
  const save = useNicknameSave();
  const input = useNicknameInput();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<NicknameProblem | null>(null);
  const [saved, setSaved] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const focusTrigger = useRef(false);

  const stored = nickname ?? '';
  const { visibleError } = input;
  const unchanged = input.check.normalized === stored;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
    else if (focusTrigger.current) {
      focusTrigger.current = false;
      triggerRef.current?.focus();
    }
  }, [editing]);

  const startEdit = () => {
    input.replace(stored);
    input.setShortRevealed(false);
    setProblem(null);
    setSaved(false);
    setEditing(true);
  };

  const close = () => {
    focusTrigger.current = true;
    setEditing(false);
    setProblem(null);
  };

  const submit = async () => {
    if (saving || input.composingRef.current) return;
    const current = checkNickname(input.value);
    if (current.error) {
      input.setShortRevealed(true);
      return;
    }
    if (current.normalized === stored) return;
    setSaving(true);
    setProblem(null);
    const result = await save(current.empty ? null : current.normalized);
    setSaving(false);
    if (result.kind === 'saved') {
      setSaved(true);
      close();
      return;
    }
    if (result.kind === 'expired') input.replace(result.currentNickname ?? '');
    setProblem(nicknameProblem(result, { unsent: 'CPY-F30-021', rejected: 'CPY-F30-020' }));
  };

  const displayName = nickname ?? passengerCode;
  const status = saving ? copy['CPY-F30-018'] : problem ? copy[problem.id] : saved ? copy['CPY-F30-019'] : null;
  const showUnchanged = editing && unchanged && !saving && !problem;
  const describedBy = `f30-help f30-count${visibleError ? ' f30-error' : ''}${showUnchanged ? ' f30-unchanged' : ''}`;

  return (
    <>
      <dl className="arca-settings-pairs">
        <div>
          <dt className="arca-text-secondary">{copy['CPY-F30-003']}</dt>
          <dd className="arca-user-text">{fill(copy['CPY-F30-004'], { displayName })}</dd>
        </div>
        <div>
          <dt className="arca-text-secondary">{copy['CPY-F30-005']}</dt>
          <dd>{fill(copy['CPY-F30-006'], { passengerCode })}</dd>
        </div>
      </dl>
      {editing ? (
        <div className="arca-stack">
          <PixelTextField
            inputRef={inputRef}
            id="f30-nickname"
            label={copy['CPY-F30-008']}
            placeholder={copy['CPY-F30-009']}
            describedBy={describedBy}
            invalid={visibleError !== null}
            value={input.value}
            readOnly={saving}
            enterKeyHint="done"
            autoComplete="off"
            {...input.fieldHandlers(() => void submit())}
          />
          <div className="arca-field-help">
            <span id="f30-help">{copy['CPY-F30-010']}</span>
            <span id="f30-count">{fill(copy['CPY-F30-011'], { currentCount: String(input.currentCount) })}</span>
          </div>
          {visibleError ? (
            <p className="arca-field-error" id="f30-error">
              {copy[errorCopy[visibleError]]}
            </p>
          ) : null}
          {showUnchanged ? (
            <p className="arca-text-secondary" id="f30-unchanged">
              {copy['CPY-F30-017']}
            </p>
          ) : null}
          <div className="arca-actions">
            <PixelButton
              variant="primary"
              loading={saving}
              disabled={!saving && (unchanged || visibleError !== null)}
              onClick={() => void submit()}
            >
              {problem && problem.id !== 'CPY-F11-044' ? copy['CPY-F30-022'] : copy['CPY-F30-015']}
            </PixelButton>
            <PixelButton disabled={saving} onClick={close}>
              {copy['CPY-F30-016']}
            </PixelButton>
          </div>
        </div>
      ) : (
        <div className="arca-actions">
          <PixelButton ref={triggerRef} onClick={startEdit}>
            {copy['CPY-F30-007']}
          </PixelButton>
        </div>
      )}
      <InlineStatus message={status} tone={problem?.tone ?? 'neutral'} />
    </>
  );
}
