import { useState } from 'react';
import { useNavigate } from 'react-router';
import { usePassengerProfile } from '../../app/hooks/passenger.ts';
import { appVersion, type SettingsLink, useSettingsLinks } from '../../app/hooks/settings.ts';
import { paths, useArcaNavigate, useRouteState } from '../../app/navigation.ts';
import {
  InlineStatus,
  InsetPanel,
  PixelAppShell,
  PixelButton,
  PixelIconButton,
  PixelPlaceholder,
  RecordPanel,
  ScreenTitle,
  StatePanel,
} from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { PassengerGroup } from './PassengerGroup.tsx';

export function SettingsScreen() {
  const profile = usePassengerProfile();
  const routeState = useRouteState();
  const routerNavigate = useNavigate();
  const navigate = useArcaNavigate();
  const openLink = useSettingsLinks();
  const [linkFailed, setLinkFailed] = useState(false);

  const back = () => {
    if (routeState) routerNavigate(-1);
    else navigate(paths.today, {}, { replace: true });
  };

  const open = async (link: SettingsLink) => {
    setLinkFailed(false);
    const result = await openLink(link);
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
