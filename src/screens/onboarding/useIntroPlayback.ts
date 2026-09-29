import { useCallback, useEffect, useRef, useState } from 'react';
import { copy } from '../../ui/copy.ts';
import { prefersReducedMotion } from '../../ui/motion.ts';

export const scenes = [
  copy['CPY-F01-013'],
  copy['CPY-F01-014'],
  copy['CPY-F01-015'],
  copy['CPY-F01-016'],
  copy['CPY-F01-017'],
  copy['CPY-F01-018'],
].map((text) => text.split('\n\n'));
export const totalScenes = String(scenes.length);

const TYPE_STEP_MS = 35;
const SCENE_SETTLE_MS = 320;
const DIALOG_CLOSE_MS = 320;

const sentenceLength = (scene: number, sentence: number) => Array.from(scenes[scene]?.[sentence] ?? '').length;

export function useIntroPlayback() {
  const [position, setPosition] = useState({ scene: 0, sentence: 0 });
  const [boarding, setBoarding] = useState(false);
  const [closing, setClosing] = useState(false);
  const [quietFocus, setQuietFocus] = useState(false);
  const pointerLedRef = useRef(false);
  const sceneSentences = scenes[position.scene] ?? [];
  const sentenceText = sceneSentences[position.sentence] ?? '';
  const characters = Array.from(sentenceText);
  const [typed, setTyped] = useState(() => (prefersReducedMotion() ? characters.length : 0));
  const [announce, setAnnounce] = useState<'scene' | 'sentence' | null>(null);
  const typedRef = useRef(typed);
  typedRef.current = typed;
  const boardRef = useRef<HTMLButtonElement>(null);
  const sceneEnteringRef = useRef(false);

  useEffect(() => {
    const length = sentenceLength(position.scene, position.sentence);
    if (prefersReducedMotion()) return;
    let timer: number | undefined;
    const start = () => {
      sceneEnteringRef.current = false;
      timer = window.setInterval(() => {
        setTyped((count) => {
          if (count + 1 >= length) window.clearInterval(timer);
          return Math.min(count + 1, length);
        });
      }, TYPE_STEP_MS);
    };
    const settle = sceneEnteringRef.current ? window.setTimeout(start, SCENE_SETTLE_MS) : undefined;
    if (settle === undefined) start();
    return () => {
      window.clearTimeout(settle);
      window.clearInterval(timer);
    };
  }, [position]);

  useEffect(() => {
    const onPointer = () => {
      pointerLedRef.current = true;
    };
    const onKey = () => {
      pointerLedRef.current = false;
      setQuietFocus(false);
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  useEffect(() => {
    if (boarding) boardRef.current?.focus();
  }, [boarding]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => {
      setClosing(false);
      setBoarding(true);
    }, DIALOG_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  const lastSentence = position.sentence === sceneSentences.length - 1;

  const moveTo = useCallback((scene: number, sentence: number) => {
    setTyped(prefersReducedMotion() ? sentenceLength(scene, sentence) : 0);
    setPosition({ scene, sentence });
  }, []);

  const advance = useCallback(() => {
    if (boarding || closing) return;
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
      sceneEnteringRef.current = true;
      moveTo(position.scene + 1, 0);
      return;
    }
    setAnnounce(null);
    setQuietFocus(pointerLedRef.current);
    if (prefersReducedMotion()) setBoarding(true);
    else setClosing(true);
  }, [boarding, closing, characters.length, lastSentence, moveTo, position.scene, position.sentence]);

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

  return {
    position,
    sceneSentences,
    sentenceText,
    characters,
    typed,
    done: typed >= characters.length,
    announce,
    boarding,
    closing,
    boardRef,
    quietFocus,
    advance,
  };
}
