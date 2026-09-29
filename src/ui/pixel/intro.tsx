import { useEffect, useState } from 'react';
import scene1 from '../../../design/assets/AST-004/export/scene-1.webp?no-inline';
import scene2 from '../../../design/assets/AST-004/export/scene-2.webp?no-inline';
import scene3 from '../../../design/assets/AST-004/export/scene-3.webp?no-inline';
import scene4 from '../../../design/assets/AST-004/export/scene-4.webp?no-inline';
import scene5 from '../../../design/assets/AST-004/export/scene-5.webp?no-inline';
import scene6 from '../../../design/assets/AST-004/export/scene-6.webp?no-inline';
import { PixelArt } from './art.tsx';
import { introScenes } from './scenes.tsx';

function IntroSceneArt({ index }: { index: number }) {
  const rows = introScenes[index] ?? introScenes[0];
  if (!rows) return null;
  return <PixelArt rows={rows} className="arca-scene-art arca-intro-art" />;
}

const introSceneImages: readonly string[] = [scene1, scene2, scene3, scene4, scene5, scene6];
const wholeFrameScenes: ReadonlySet<string> = new Set([scene6]);

function sceneClass(src: string, entering: boolean): string {
  return [
    'arca-intro-scene',
    wholeFrameScenes.has(src) ? 'arca-intro-scene--whole' : null,
    entering ? 'arca-intro-scene--entering' : null,
  ]
    .filter(Boolean)
    .join(' ');
}

function prefetchLaterScenes(): () => void {
  const load = () => {
    for (const src of introSceneImages.slice(1)) new Image().src = src;
  };
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(load);
    return () => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(load, 200);
  return () => window.clearTimeout(timer);
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function IntroScene({ index }: { index: number }) {
  const src = introSceneImages[index] ?? introSceneImages[0];
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [shown, setShown] = useState(src);
  const [previous, setPrevious] = useState<string | null>(null);

  useEffect(prefetchLaterScenes, []);

  if (src && src !== shown) {
    setPrevious(prefersReducedMotion() || !shown || failed.has(shown) ? null : shown);
    setShown(src);
  }

  if (!src || failed.has(src)) return <IntroSceneArt index={index} />;
  return (
    <>
      {previous ? <img key={previous} className={sceneClass(previous, false)} src={previous} alt="" /> : null}
      <img
        key={src}
        className={sceneClass(src, previous !== null)}
        src={src}
        alt=""
        decoding="async"
        onAnimationEnd={() => setPrevious(null)}
        onError={() => {
          setPrevious(null);
          setFailed((current) => new Set(current).add(src));
        }}
      />
    </>
  );
}
