import { defaultPalette, PixelArt, runsOf } from './art.tsx';

export const joyLens: readonly string[] = [
  '....SSSS....',
  '..SSttttSS..',
  '.SttTTTTttS.',
  '.StTssssTtS.',
  'STTsTTTTsTTS',
  'STTsTwwTsTTS',
  'STTsTwwTsTTS',
  'STTsTTTTsTTS',
  '.StTssssTtS.',
  '.SttTTTTttS.',
  '..SSttttSS..',
  '....SSSS....',
];

export function JoyMark({ cell = 4 }: { cell?: number }) {
  return <PixelArt rows={joyLens} cell={cell} className="arca-joy-mark" />;
}

const fragment: readonly string[] = [
  '......NN......',
  '....NNmnN.....',
  '..NNmmmnnN....',
  '..NmmmmnnnN...',
  '..NmmmmnnnnN..',
  '.NmmmmmMnnnnN.',
  '.NmmmmmMnnnnN.',
  '.NmmmmmMMnnN..',
  '..NmmmMMMMnN..',
  '...NmmMMMMNN..',
  '....NmMNNN....',
  '.....NN.......',
];

export function MemoryFragment({ cell = 4 }: { cell?: number }) {
  return <PixelArt rows={fragment} cell={cell} className="arca-fragment" />;
}

const GLOW_PAD = 4;
const glowRings: readonly (readonly string[])[] = (() => {
  const width = (fragment[0]?.length ?? 0) + GLOW_PAD * 2;
  const height = fragment.length + GLOW_PAD * 2;
  const solid = (x: number, y: number) => {
    const ch = fragment[y - GLOW_PAD]?.[x - GLOW_PAD];
    return ch !== undefined && ch !== '.';
  };
  const cells: [number, number][] = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (solid(x, y)) cells.push([x, y]);
  return [1, 2, 3].map((ring) =>
    Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => {
        if (solid(x, y)) return '.';
        let nearest = Number.POSITIVE_INFINITY;
        for (const [cx, cy] of cells) nearest = Math.min(nearest, Math.abs(cx - x) + Math.abs(cy - y));
        return nearest === ring ? (ring === 1 ? 'n' : 'N') : '.';
      }).join(''),
    ),
  );
})();
const glowBody: readonly string[] = [
  ...Array.from({ length: GLOW_PAD }, () => '.'.repeat((fragment[0]?.length ?? 0) + GLOW_PAD * 2)),
  ...fragment.map((row) => `${'.'.repeat(GLOW_PAD)}${row}${'.'.repeat(GLOW_PAD)}`),
  ...Array.from({ length: GLOW_PAD }, () => '.'.repeat((fragment[0]?.length ?? 0) + GLOW_PAD * 2)),
];

export function MemoryFragmentGlow({ cell = 8 }: { cell?: number }) {
  const width = glowBody[0]?.length ?? 0;
  const height = glowBody.length;
  const layer = (rows: readonly string[], className: string) => (
    <g key={className} className={className}>
      {runsOf(rows, defaultPalette).map((run) => (
        <rect key={`${run.x}-${run.y}`} x={run.x} y={run.y} width={run.w} height={1} fill={run.fill} />
      ))}
    </g>
  );
  return (
    <svg
      className="arca-fragment-glow"
      width={width * cell}
      height={height * cell}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {glowRings.map((rows, index) =>
        layer(rows, `arca-fragment-glow__ring arca-fragment-glow__ring--${String(index + 1)}`),
      )}
      {layer(glowBody, 'arca-fragment-glow__body')}
    </svg>
  );
}
