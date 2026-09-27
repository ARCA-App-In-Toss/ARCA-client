import { useLayoutEffect, useRef, useState } from 'react';
import { useAllDeletedNotice } from '../../app/AppServices.tsx';
import { paths, useArcaNavigate } from '../../app/navigation.ts';
import introStory from '../../content/introStory.txt?raw';
import { PixelAppShell, PixelButton, PixelPlaceholder, ScenePanel, ScreenTitle } from '../../ui/components.tsx';
import { copy, fill } from '../../ui/copy.ts';

// F01 (03 §4.2, 04 §6.2, IX-030): bundled narrative only — no input, no server change. Finishing or
// skipping the intro only opens F02; it never creates a passenger (ON-01).

const scenes = [copy['CPY-F01-010'], copy['CPY-F01-011'], copy['CPY-F01-012']] as const;
const totalScenes = String(scenes.length);

export function IntroScreen() {
  const navigate = useArcaNavigate();
  // After a full deletion F01 announces the success once after its title (IX-029, 04 §7.11).
  const deletedNotice = useAllDeletedNotice();
  const [scene, setScene] = useState(0);
  const [storyOpen, setStoryOpen] = useState(false);
  /** Set only by a user action so the first render does not announce or move focus. */
  const [announce, setAnnounce] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const storyTitleRef = useRef<HTMLHeadingElement>(null);
  const scrollBeforeStory = useRef(0);
  /** True only after a user toggle, so mount keeps focus on the screen title (IX-018). */
  const toggled = useRef(false);

  // IX-030: expand focuses the story title; collapse restores the scroll context and the toggle.
  useLayoutEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    if (storyOpen) {
      storyTitleRef.current?.focus();
      return;
    }
    window.scrollTo(0, scrollBeforeStory.current);
    toggleRef.current?.focus({ preventScroll: true });
  }, [storyOpen]);

  const toJoin = () => navigate(paths.join);
  const isLast = scene === scenes.length - 1;
  const current = String(scene + 1);
  const progressLabel = fill(copy['CPY-F01-003'], { currentScene: current, totalScenes });

  const openStory = () => {
    scrollBeforeStory.current = window.scrollY;
    toggled.current = true;
    setStoryOpen(true);
  };
  const closeStory = () => {
    toggled.current = true;
    setStoryOpen(false);
  };

  return (
    <PixelAppShell>
      <div className="arca-intro-bar">
        <p className="arca-intro-progress" role="img" aria-label={progressLabel}>
          {fill(copy['CPY-F01-002'], { currentScene: current, totalScenes })}
        </p>
        <PixelButton variant="ghost" className="arca-intro-skip" onClick={toJoin}>
          {copy['CPY-F01-006']}
        </PixelButton>
      </div>
      <ScreenTitle>{copy['CPY-F01-001']}</ScreenTitle>
      <ScenePanel>
        <PixelPlaceholder />
        <p className="arca-narrative">{scenes[scene]}</p>
      </ScenePanel>
      <div className="arca-visually-hidden" role="status" aria-live="polite">
        {announce ? `${progressLabel}. ${scenes[scene]}` : deletedNotice ? copy['CPY-F31-019'] : ''}
      </div>
      <PixelButton ref={toggleRef} aria-expanded={storyOpen} onClick={storyOpen ? closeStory : openStory}>
        {storyOpen ? copy['CPY-F01-008'] : copy['CPY-F01-007']}
      </PixelButton>
      {storyOpen ? (
        <section className="arca-story" aria-labelledby="arca-story-title">
          <h2 id="arca-story-title" ref={storyTitleRef} tabIndex={-1} className="arca-label">
            {copy['CPY-F01-009']}
          </h2>
          <p className="arca-narrative">{introStory}</p>
          <PixelButton onClick={closeStory}>{copy['CPY-F01-008']}</PixelButton>
        </section>
      ) : null}
      <div className="arca-actions">
        <PixelButton
          variant="primary"
          onClick={() => {
            if (isLast) return toJoin();
            setAnnounce(true);
            setScene(scene + 1);
          }}
        >
          {isLast ? copy['CPY-F01-005'] : copy['CPY-F01-004']}
        </PixelButton>
      </div>
    </PixelAppShell>
  );
}
