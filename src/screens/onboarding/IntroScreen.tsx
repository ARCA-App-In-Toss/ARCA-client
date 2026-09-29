import { type MouseEvent, useEffect, useState } from 'react';
import { useAllDeletedNotice } from '../../app/hooks/onboarding.ts';
import { paths, useArcaNavigate } from '../../app/navigation.ts';
import { PixelAppShell, PixelButton, ScreenTitle } from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { IntroScene, PixelArt } from '../../ui/pixel.tsx';
import { prefersReducedMotion, scenes, totalScenes, useIntroPlayback } from './useIntroPlayback.ts';

const DEPART_MS = 900;

const nextMark: readonly string[] = ['#####', '.###.', '..#..'];

export function IntroScreen() {
  const navigate = useArcaNavigate();
  const deletedNotice = useAllDeletedNotice();
  const {
    position,
    sceneSentences,
    sentenceText,
    characters,
    typed,
    done,
    announce,
    boarding,
    boardRef,
    quietFocus,
    advance,
  } = useIntroPlayback();
  const [departing, setDeparting] = useState(false);

  const toJoin = () => navigate(paths.join);

  const board = () => {
    if (departing) return;
    if (prefersReducedMotion()) {
      toJoin();
      return;
    }
    setDeparting(true);
  };
  useEffect(() => {
    if (!departing) return;
    const timer = window.setTimeout(() => navigate(paths.join), DEPART_MS);
    return () => window.clearTimeout(timer);
  }, [departing, navigate]);
  const current = String(position.scene + 1);
  const progressLabel = fill(copy['CPY-F01-003'], { currentScene: current, totalScenes });
  const announcement =
    announce === 'scene' ? `${progressLabel}. ${sentenceText}` : announce === 'sentence' ? sentenceText : '';

  const onNext = (event: MouseEvent) => {
    event.stopPropagation();
    advance();
  };

  return (
    <PixelAppShell className="arca-page--intro">
      <div className="arca-intro-backdrop" aria-hidden="true">
        <IntroScene index={position.scene} />
      </div>
      <div className="arca-intro-bar">
        <p className="arca-intro-progress" role="img" aria-label={progressLabel}>
          <span className="arca-intro-dots" aria-hidden="true">
            {scenes.map((sentences, index) => (
              <i key={sentences[0]} className={index === position.scene ? 'is-current' : undefined} />
            ))}
          </span>
          {fill(copy['CPY-F01-002'], { currentScene: current, totalScenes })}
        </p>
        <PixelButton variant="ghost" className="arca-intro-skip" onClick={toJoin}>
          {copy['CPY-F01-006']}
        </PixelButton>
      </div>
      <div className="arca-visually-hidden">
        <ScreenTitle>{copy['CPY-F01-001']}</ScreenTitle>
      </div>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Enter/Space는 document 수준에서 처리한다. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 다음 버튼을 겹쳐 둔 편의용 탭 영역이다. */}
      <div className="arca-intro-stage" onClick={advance}>
        <div className="arca-intro-view" />
        {boarding ? (
          <div className="arca-actions">
            <PixelButton ref={boardRef} variant="primary" data-quiet-focus={quietFocus || undefined} onClick={board}>
              {copy['CPY-F01-005']}
            </PixelButton>
          </div>
        ) : (
          <IntroDialog
            sentences={sceneSentences}
            current={position.sentence}
            characters={characters}
            typed={typed}
            sentenceText={sentenceText}
            done={done}
            onNext={onNext}
          />
        )}
      </div>
      {departing ? <div className="arca-intro-curtain" aria-hidden="true" /> : null}
      <div className="arca-visually-hidden" role="status" aria-live="polite">
        {announcement || (deletedNotice ? copy['CPY-F31-019'] : '')}
      </div>
    </PixelAppShell>
  );
}

function IntroDialog({
  sentences,
  current,
  characters,
  typed,
  sentenceText,
  done,
  onNext,
}: {
  sentences: readonly string[];
  current: number;
  characters: readonly string[];
  typed: number;
  sentenceText: string;
  done: boolean;
  onNext: (event: MouseEvent) => void;
}) {
  return (
    <div className="arca-intro-dialog arca-px">
      <div className="arca-intro-lines" aria-hidden="true">
        {sentences.map((sentence, index) =>
          index === current ? (
            <p key={sentence} className="arca-narrative arca-intro-line">
              {characters.map((character, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 고정된 한 문장의 글자들이다.
                <span key={index} className={index < typed ? undefined : 'arca-intro-line__rest'}>
                  {character}
                </span>
              ))}
            </p>
          ) : (
            <p key={sentence} className="arca-narrative arca-intro-line arca-intro-line--ghost">
              {sentence}
            </p>
          ),
        )}
      </div>
      <p className="arca-visually-hidden">{sentenceText}</p>
      <PixelButton variant="ghost" className="arca-intro-next" aria-label={copy['CPY-F01-004']} onClick={onNext}>
        <PixelArt
          rows={nextMark}
          cell={2}
          className={done ? 'arca-intro-next__mark' : 'arca-intro-next__mark is-waiting'}
        />
      </PixelButton>
    </div>
  );
}
