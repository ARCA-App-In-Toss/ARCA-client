import { memo, useCallback, useState } from 'react';
import capsule from '../../../design/assets/AST-012/export/capsule.webp?no-inline';
import type { SkyPhase } from '../sky.ts';

const GRID = 156;

type Tone = 'sky-1' | 'sky-2' | 'sky-3' | 'sky-4' | 'sky-horizon';

const STOPS: readonly (readonly [number, Tone])[] = [
  [16, 'sky-1'],
  [60, 'sky-2'],
  [96, 'sky-3'],
  [120, 'sky-4'],
  [136, 'sky-horizon'],
];
const STEP_ROWS = 2;

interface Band {
  y: number;
  h: number;
  fill: string;
  mix: string | null;
}

function toneAt(row: number): { fill: string; mix: string | null } {
  const first = STOPS[0];
  const last = STOPS[STOPS.length - 1];
  if (!first || !last || row <= first[0]) return { fill: `var(--${first?.[1] ?? 'sky-1'})`, mix: null };
  if (row >= last[0]) return { fill: `var(--${last[1]})`, mix: null };
  const i = STOPS.findIndex(([at]) => at > row);
  const from = STOPS[i - 1];
  const to = STOPS[i];
  if (!from || !to) return { fill: `var(--${last[1]})`, mix: null };
  const share = Math.round(((row - from[0]) / (to[0] - from[0])) * 100);
  const near = share < 50 ? from[1] : to[1];
  return { fill: `var(--${near})`, mix: `color-mix(in oklab, var(--${to[1]}) ${share}%, var(--${from[1]}))` };
}

function bands(): Band[] {
  const out: Band[] = [];
  for (let y = 0; y < GRID; y += STEP_ROWS) {
    const tone = toneAt(y + STEP_ROWS / 2);
    const prev = out[out.length - 1];
    if (prev && prev.fill === tone.fill && prev.mix === tone.mix) prev.h += STEP_ROWS;
    else out.push({ y, h: STEP_ROWS, ...tone });
  }
  return out;
}

const BANDS = bands();

type StarKind = 'sparkle' | 'bright' | 'dim';

interface Star {
  x: number;
  y: number;
  kind: StarKind;
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAR_FIELD: readonly Star[] = (() => {
  const next = seeded(0xa2ca);
  const points: { x: number; y: number }[] = [];
  while (points.length < 49) {
    const x = 4 + Math.floor(next() * (GRID - 8));
    const y = 16 + Math.floor(next() * 116);
    if (points.every((p) => Math.abs(p.x - x) + Math.abs(p.y - y) > 7)) points.push({ x, y });
  }
  return points.map((p, i) => ({ ...p, kind: i < 3 ? 'sparkle' : i < 13 ? 'bright' : 'dim' }));
})();

const STAR_LIMIT: Record<SkyPhase, { count: Record<StarKind, number>; below: number }> = {
  night: { count: { sparkle: 3, bright: 10, dim: 36 }, below: GRID },
  dawn: { count: { sparkle: 1, bright: 5, dim: 18 }, below: 104 },
  dusk: { count: { sparkle: 1, bright: 5, dim: 18 }, below: 104 },
  day: { count: { sparkle: 0, bright: 2, dim: 8 }, below: GRID },
};

function starsFor(phase: SkyPhase): Star[] {
  const limit = STAR_LIMIT[phase];
  const used: Record<StarKind, number> = { sparkle: 0, bright: 0, dim: 0 };
  return STAR_FIELD.filter((star) => {
    if (star.y >= limit.below || used[star.kind] >= limit.count[star.kind]) return false;
    used[star.kind] += 1;
    return true;
  });
}

function StarMark({ star }: { star: Star }) {
  if (star.kind === 'dim') return <rect x={star.x} y={star.y} width={1} height={1} fill="var(--sky-star)" />;
  if (star.kind === 'bright') return <rect x={star.x} y={star.y} width={1} height={1} fill="var(--sky-star-bright)" />;
  return (
    <>
      <rect x={star.x - 1} y={star.y} width={3} height={1} fill="var(--sky-star)" />
      <rect x={star.x} y={star.y - 1} width={1} height={3} fill="var(--sky-star)" />
      <rect x={star.x} y={star.y} width={1} height={1} fill="var(--sky-star-bright)" />
    </>
  );
}

const SkyArt = memo(function SkyArt({ phase }: { phase: SkyPhase }) {
  return (
    <svg
      className="arca-capsule-scene__layer"
      viewBox={`0 0 ${GRID} ${GRID}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {BANDS.map((band) => (
        <rect
          key={band.y}
          x={0}
          y={band.y}
          width={GRID}
          height={band.h}
          fill={band.fill}
          style={band.mix ? { fill: band.mix } : undefined}
        />
      ))}
      {starsFor(phase).map((star) => (
        <StarMark key={`${star.x}-${star.y}`} star={star} />
      ))}
    </svg>
  );
});

type Load = 'loading' | 'ready' | 'failed';

export function CapsuleBackdrop({ sky }: { sky: SkyPhase }) {
  const [load, setLoad] = useState<Load>('loading');
  const markLoaded = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoad('ready');
  }, []);
  if (load === 'failed') return null;
  return (
    <div
      className={load === 'ready' ? 'arca-capsule-backdrop arca-capsule-backdrop--ready' : 'arca-capsule-backdrop'}
      aria-hidden="true"
    >
      <div className="arca-capsule-scene" data-sky={sky}>
        <SkyArt phase={sky} />
        <img
          ref={markLoaded}
          className="arca-capsule-scene__layer"
          src={capsule}
          alt=""
          decoding="async"
          onLoad={() => setLoad('ready')}
          onError={() => setLoad('failed')}
        />
      </div>
    </div>
  );
}
