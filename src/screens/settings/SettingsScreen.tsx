import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  appVersion,
  type SettingsLink,
  useNicknameSave,
  usePassengerProfile,
  useSettingsLinks,
} from '../../app/AppServices.tsx';
import { paths, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import { countGraphemes } from '../../domain/text/graphemes.ts';
import { checkNickname, type NicknameError } from '../../domain/text/nickname.ts';
import {
  InlineStatus,
  InsetPanel,
  PixelAppShell,
  PixelButton,
  PixelIconButton,
  PixelPlaceholder,
  PixelTextField,
  RecordPanel,
  ScreenTitle,
  StatePanel,
} from '../../ui/components.tsx';
import { type CopyId, copy, fill } from '../../ui/copy.ts';

// F30 — settings (03 §7.1, 04 §6.13, IX-004·018). No Primary for the page; each row is its own
// secondary action. The nickname edit expands in place, keeps no draft, and closes back to its trigger.

const errorCopy: Record<NicknameError, CopyId> = {
  'too-short': 'CPY-F30-012',
  'too-long': 'CPY-F30-013',
  forbidden: 'CPY-F30-014',
};

type Problem = { id: CopyId; tone: 'danger' | 'neutral' };

export function SettingsScreen() {
  const profile = usePassengerProfile();
  const routeState = useRouteState();
  const routerNavigate = useNavigate();
  const navigate = useArcaNavigate();
  const openLink = useSettingsLinks();
  const [linkFailed, setLinkFailed] = useState(false);

  // Back returns to the root it came from (F10/F20); a reload without that entry goes to F10.
  const back = () => {
    if (routeState) routerNavigate(-1);
    else navigate(paths.today, {}, { replace: true });
  };

  const open = async (link: SettingsLink) => {
    setLinkFailed(false);
    const result = await openLink(link);
    // F30 stays mounted, so the trigger, scroll and edit state are still there on return (IX-018).
    if (result.kind === 'unavailable') setLinkFailed(true);
  };

  const header = (
    <div className="arca-screen-header">
      <PixelIconButton label={copy['CPY-COM-005']} icon="back" onClick={back} />
      <ScreenTitle>{copy['CPY-F30-001']}</ScreenTitle>
    </div>
  );

  return (
    <PixelAppShell>
      {header}
      <section className="arca-settings-group" aria-labelledby="f30-passenger">
        <h2 className="arca-label" id="f30-passenger">
          {copy['CPY-F30-002']}
        </h2>
        {profile.data ? (
          <PassengerGroup passengerCode={profile.data.passengerCode} nickname={profile.data.nickname} />
        ) : profile.isError ? (
          <StatePanel>
            <p>{copy['CPY-F20-022']}</p>
            <PixelButton loading={profile.isFetching} onClick={() => void profile.refetch()}>
              {copy['CPY-F30-022']}
            </PixelButton>
          </StatePanel>
        ) : (
          <RecordPanel>
            <PixelPlaceholder />
          </RecordPanel>
        )}
      </section>
      <InsetPanel>
        <h2 className="arca-label">{copy['CPY-F30-023']}</h2>
        <p className="arca-text-secondary">{copy['CPY-F30-024']}</p>
      </InsetPanel>
      <section className="arca-settings-group" aria-labelledby="f30-support">
        <h2 className="arca-label" id="f30-support">
          {copy['CPY-F30-025']}
        </h2>
        <div className="arca-actions">
          <PixelButton variant="row" onClick={() => void open('terms')}>
            {copy['CPY-F30-026']}
          </PixelButton>
          <PixelButton variant="row" onClick={() => void open('privacy')}>
            {copy['CPY-F30-027']}
          </PixelButton>
          <PixelButton variant="row" onClick={() => void open('support')}>
            {copy['CPY-F30-028']}
          </PixelButton>
        </div>
        <InlineStatus message={linkFailed ? copy['CPY-F30-029'] : null} tone="danger" />
      </section>
      <section className="arca-settings-group" aria-labelledby="f30-app">
        <h2 className="arca-label" id="f30-app">
          {copy['CPY-F30-030']}
        </h2>
        <dl className="arca-settings-pairs">
          <div>
            <dt className="arca-text-secondary">{copy['CPY-F30-031']}</dt>
            <dd>{fill(copy['CPY-F30-032'], { appVersion })}</dd>
          </div>
        </dl>
      </section>
      <section className="arca-settings-group arca-settings-danger" aria-labelledby="f30-danger">
        <h2 className="arca-label" id="f30-danger">
          {copy['CPY-F30-033']}
        </h2>
        <p className="arca-text-secondary">{copy['CPY-F30-035']}</p>
        <div className="arca-actions">
          <PixelButton variant="danger" onClick={() => navigate(paths.deleteAll)}>
            {copy['CPY-F30-034']}
          </PixelButton>
        </div>
      </section>
    </PixelAppShell>
  );
}

function PassengerGroup({ passengerCode, nickname }: { passengerCode: string; nickname: string | null }) {
  const save = useNicknameSave();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  /** Value as of the last non-composing change; IME intermediate text is never judged (IX-001). */
  const [committed, setCommitted] = useState('');
  const composing = useRef(false);
  const [shortRevealed, setShortRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saved, setSaved] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const focusTrigger = useRef(false);

  const stored = nickname ?? '';
  const check = checkNickname(committed);
  const currentCount = countGraphemes(value.trim());
  const unchanged = check.normalized === stored;
  const visibleError = check.error === 'too-short' && !shortRevealed ? null : check.error;

  // Closing the edit returns focus to its trigger (IX-004·018); opening focuses the field.
  useEffect(() => {
    if (editing) inputRef.current?.focus();
    else if (focusTrigger.current) {
      focusTrigger.current = false;
      triggerRef.current?.focus();
    }
  }, [editing]);

  const startEdit = () => {
    setValue(stored);
    setCommitted(stored);
    setShortRevealed(false);
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
    if (saving || composing.current) return;
    const current = checkNickname(value);
    if (current.error) {
      setShortRevealed(true);
      return;
    }
    if (current.normalized === stored) return;
    setSaving(true);
    setProblem(null);
    // An empty value is the explicit clear: the server then calls the passenger by code (IX-004).
    const result = await save(current.empty ? null : current.normalized);
    setSaving(false);
    if (result.kind === 'saved') {
      setSaved(true);
      close();
      return;
    }
    if (result.kind === 'unsent') setProblem({ id: 'CPY-F30-021', tone: 'danger' });
    else if (result.kind === 'rejected') setProblem({ id: 'CPY-F30-020', tone: 'danger' });
    else if (result.kind === 'expired') {
      // The old key is sealed: show the current value; the next save is a new action (MS-NICK-002).
      const next = result.currentNickname ?? '';
      setValue(next);
      setCommitted(next);
      setProblem({ id: 'CPY-F11-044', tone: 'neutral' });
    }
    // Unconfirmed is not a failure: the same input is resent with the same key on the next save.
    else setProblem({ id: 'CPY-F11-044', tone: 'neutral' });
  };

  const displayName = nickname ?? passengerCode;
  // One live region for the group, mounted across edit/read so the result is announced once (04 §7.11).
  const status = saving ? copy['CPY-F30-018'] : problem ? copy[problem.id] : saved ? copy['CPY-F30-019'] : null;
  // Why save is disabled: shown whenever the value equals the stored one, read with the field (CMP-020).
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
            value={value}
            readOnly={saving}
            enterKeyHint="done"
            autoComplete="off"
            onChange={(event) => {
              setValue(event.target.value);
              if (!composing.current) setCommitted(event.target.value);
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={(event) => {
              composing.current = false;
              setCommitted(event.currentTarget.value);
            }}
            onBlur={() => {
              if (checkNickname(value).error === 'too-short') setShortRevealed(true);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing || composing.current) return;
              event.preventDefault();
              void submit();
            }}
          />
          <div className="arca-field-help">
            <span id="f30-help">{copy['CPY-F30-010']}</span>
            <span id="f30-count">{fill(copy['CPY-F30-011'], { currentCount: String(currentCount) })}</span>
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
