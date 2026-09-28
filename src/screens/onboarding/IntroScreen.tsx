import { type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useAllDeletedNotice } from '../../app/AppServices.tsx';
import { paths, useArcaNavigate } from '../../app/navigation.ts';
import { PixelAppShell, PixelButton, ScreenTitle } from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';
import { IntroScene, PixelArt } from '../../ui/pixel.tsx';

// F01 (03 §4.2, 04 §6.2, IX-030): bundled narrative only — no input, no server change. Finishing or
// skipping the intro only opens F02; it never creates a passenger (ON-01).
//
// Full-screen scene with a bottom dialog box. Each scene's sentences replace one another in the box
// and type out once (02 §7.1); a tap, Enter/Space or the next control first completes the sentence,
// then moves to the next sentence or scene. Reduced Motion shows every sentence complete at once.
// After the last sentence the box gives way to the boarding Primary alone.

/** Scene copy: a blank line separates sentences (one box each); a single newline breaks a line (04 §7.2). */
const scenes = [
  copy['CPY-F01-013'],
  copy['CPY-F01-014'],
  copy['CPY-F01-015'],
  copy['CPY-F01-016'],
  copy['CPY-F01-017'],
  copy['CPY-F01-018'],
].map((text) => text.split('\n\n'));
const totalScenes = String(scenes.length);

/** 02 §7.1 `motion.duration.type`: one character per step. */
const TYPE_STEP_MS = 35;

/** Pixel ▼ shown once a sentence is complete; decorative, the control carries the name. */
const nextMark: readonly string[] = ['#####', '.###.', '..#..'];

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function IntroScreen() {
  const navigate = useArcaNavigate();
  // After a full deletion F01 announces the success once after its title (IX-029, 04 §7.11).
  const deletedNotice = useAllDeletedNotice();
  const [position, setPosition] = useState({ scene: 0, sentence: 0 });
  /** True once the reader moves past the last sentence: only the boarding Primary remains. */
  const [boarding, setBoarding] = useState(false);
  const sceneSentences = scenes[position.scene] ?? [];
  const sentenceText = sceneSentences[position.sentence] ?? '';
  const characters = Array.from(sentenceText);
  const [typed, setTyped] = useState(() => (prefersReducedMotion() ? characters.length : 0));
  /** Set only by a user action so the first render does not announce. */
  const [announce, setAnnounce] = useState<'scene' | 'sentence' | null>(null);
  const done = typed >= characters.length;
  const typedRef = useRef(typed);
  typedRef.current = typed;
  const boardRef = useRef<HTMLButtonElement>(null);

  // Type the current sentence once. The start value is set in the same update as the new position
  // (see `moveTo`), so the next sentence never paints in full for a frame before typing begins.
  useEffect(() => {
    const length = Array.from(scenes[position.scene]?.[position.sentence] ?? '').length;
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      setTyped((count) => {
        if (count + 1 >= length) window.clearInterval(timer);
        return Math.min(count + 1, length);
      });
    }, TYPE_STEP_MS);
    return () => window.clearInterval(timer);
  }, [position]);

  // The next control leaves with the box, so focus moves to the boarding Primary that replaces it.
  useEffect(() => {
    if (boarding) boardRef.current?.focus();
  }, [boarding]);

  const lastSentence = position.sentence === sceneSentences.length - 1;

  /** Moves to a sentence and resets its typing in one update (complete at once under Reduced Motion). */
  const moveTo = useCallback((scene: number, sentence: number) => {
    const length = Array.from(scenes[scene]?.[sentence] ?? '').length;
    setTyped(prefersReducedMotion() ? length : 0);
    setPosition({ scene, sentence });
  }, []);

  const advance = useCallback(() => {
    if (boarding) return;
    if (typedRef.current < characters.length) {
      setTyped(characters.length);
      return;
    }
    if (!lastSentence) {
      setAnnounce('sentence');
      moveTo(position.scene, position.sentence + 1);
      return;
    }
    if (position.scene < scenes.length - 1) {
      setAnnounce('scene');
      moveTo(position.scene + 1, 0);
      return;
    }
    setAnnounce(null);
    setBoarding(true);
  }, [boarding, characters.length, lastSentence, moveTo, position.scene, position.sentence]);

  // Enter/Space anywhere outside a control advances like a tap (the focused control handles its own).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select')) return;
      event.preventDefault();
      advance();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [advance]);

  const toJoin = () => navigate(paths.join);
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
      {/* Bottom layer: the scene covers the whole viewport; the bar and the dialog float above it. */}
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
      {/* The whole stage is a tap target for touch; keyboard and assistive tech use the next control. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Enter/Space are handled at document level above. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a convenience tap area duplicating the control. */}
      <div className="arca-intro-stage" onClick={advance}>
        {/* Open space over the scene: tapping here advances like the next control. */}
        <div className="arca-intro-view" />
        {boarding ? (
          <div className="arca-actions">
            <PixelButton ref={boardRef} variant="primary" onClick={toJoin}>
              {copy['CPY-F01-005']}
            </PixelButton>
          </div>
        ) : (
          <div className="arca-intro-dialog arca-px">
            {/* Every sentence of the scene shares one grid cell, so the box keeps the tallest one's
                height within a scene and a shorter sentence sits centred instead of leaving a gap. */}
            <div className="arca-intro-lines" aria-hidden="true">
              {sceneSentences.map((sentence, index) =>
                index === position.sentence ? (
                  <p key={sentence} className="arca-narrative arca-intro-line">
                    {/* One span per character, fixed for the whole sentence: typing only flips visibility,
                        so the balanced line breaks are computed once and never shift while typing. */}
                    {characters.map((character, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: characters of one fixed sentence.
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
        )}
      </div>
      <div className="arca-visually-hidden" role="status" aria-live="polite">
        {announcement || (deletedNotice ? copy['CPY-F31-019'] : '')}
      </div>
    </PixelAppShell>
  );
}
