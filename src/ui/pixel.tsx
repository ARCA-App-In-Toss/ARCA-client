import { type CSSProperties, useEffect, useState } from 'react';
import scene1 from '../../design/assets/AST-004/export/scene-1.webp?no-inline';
import scene2 from '../../design/assets/AST-004/export/scene-2.webp?no-inline';
import scene3 from '../../design/assets/AST-004/export/scene-3.webp?no-inline';
import scene4 from '../../design/assets/AST-004/export/scene-4.webp?no-inline';
import scene5 from '../../design/assets/AST-004/export/scene-5.webp?no-inline';
import scene6 from '../../design/assets/AST-004/export/scene-6.webp?no-inline';

// Pixel raster primitives (02 §8). Every drawing is authored on an integer grid and rendered as SVG
// rects at an integer CSS scale with crisp edges; colours come only from ARCA tokens so the same art
// reads in every surface context. Nothing here is interactive or carries information on its own: all
// art is decorative and hidden from assistive technology unless a label is given (02 §12.2).

/** Palette: one character per token colour. `.` is transparent. */
export type Palette = Record<string, string>;

const defaultPalette: Palette = {
  '#': 'currentColor',
  s: 'var(--color-signal)',
  S: 'var(--color-signal-step-1)',
  t: 'var(--color-signal-step-2)',
  T: 'var(--color-signal-step-3)',
  m: 'var(--color-memory)',
  M: 'var(--color-memory-step-1)',
  n: 'var(--color-memory-step-2)',
  N: 'var(--color-memory-step-3)',
  b: 'var(--color-brand-primary)',
  B: 'var(--color-brand-primary-deep)',
  w: 'var(--color-text-on-dark-primary)',
  g: 'var(--color-text-on-dark-secondary)',
  l: 'var(--color-border-on-dark)',
  r: 'var(--color-bg-record)',
  R: 'var(--color-bg-scene-raised)',
  i: 'var(--color-bg-inset-dark)',
  c: 'var(--color-bg-canvas)',
  C: 'var(--color-bg-canvas-deep)',
  a: 'var(--color-warmth)',
};

interface Run {
  x: number;
  y: number;
  w: number;
  fill: string;
}

/** Merges horizontal runs of the same colour so a scene stays a few dozen nodes. */
function runsOf(rows: readonly string[], palette: Palette): Run[] {
  const runs: Run[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x] ?? '.';
      const fill = ch === '.' ? null : (palette[ch] ?? null);
      if (fill === null) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === ch) end += 1;
      runs.push({ x, y, w: end - x, fill });
      x = end;
    }
  });
  return runs;
}

export interface PixelArtProps {
  rows: readonly string[];
  /** CSS px per grid cell; always an integer (02 §8.1). */
  cell?: number;
  palette?: Palette;
  /** Accessible name; omitted for decorative art (aria-hidden). */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/** Grid → crisp SVG. Width/height are fixed from the grid so the container never reflows on load. */
export function PixelArt({ rows, cell = 4, palette, label, className, style }: PixelArtProps) {
  const cols = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const merged = palette ? { ...defaultPalette, ...palette } : defaultPalette;
  const runs = runsOf(rows, merged);
  return (
    <svg
      className={className}
      style={style}
      width={cols * cell}
      height={rows.length * cell}
      viewBox={`0 0 ${cols} ${rows.length}`}
      shapeRendering="crispEdges"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {runs.map((run) => (
        <rect key={`${run.x}-${run.y}`} x={run.x} y={run.y} width={run.w} height={1} fill={run.fill} />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------------------------------------
 * CMP-023 PixelIcon — general icons on a 12×12 grid shown at 24px (2 CSS px per cell). ARCA-drawn
 * (AST-008 candidate list); `currentColor` so the button/tab colour applies.
 * ---------------------------------------------------------------------------------------------- */

export type IconName =
  | 'back'
  | 'chevron-right'
  | 'settings'
  | 'today'
  | 'archive'
  | 'memory'
  | 'edit'
  | 'delete'
  | 'copy'
  | 'check'
  | 'close'
  | 'lock';

const icons: Record<IconName, readonly string[]> = {
  back: [
    '............',
    '.......##...',
    '......##....',
    '.....##.....',
    '....##......',
    '...##.......',
    '...##.......',
    '....##......',
    '.....##.....',
    '......##....',
    '.......##...',
    '............',
  ],
  'chevron-right': [
    '............',
    '...##.......',
    '....##......',
    '.....##.....',
    '......##....',
    '.......##...',
    '.......##...',
    '......##....',
    '.....##.....',
    '....##......',
    '...##.......',
    '............',
  ],
  settings: [
    '............',
    '..####......',
    '############',
    '..####......',
    '............',
    '......####..',
    '############',
    '......####..',
    '............',
    '...####.....',
    '############',
    '...####.....',
  ],
  today: [
    '.....##.....',
    '.....##.....',
    '..#......#..',
    '...#....#...',
    '....####....',
    '#...####...#',
    '#...####...#',
    '....####....',
    '...#....#...',
    '..#......#..',
    '.....##.....',
    '.....##.....',
  ],
  archive: [
    '............',
    '..########..',
    '..#......#..',
    '..#.####.#..',
    '..#......#..',
    '..#.####.#..',
    '..#......#..',
    '..#.##...#..',
    '..#......#..',
    '..########..',
    '............',
    '............',
  ],
  memory: [
    '............',
    '.....##.....',
    '....####....',
    '...######...',
    '...######...',
    '..########..',
    '..########..',
    '...######...',
    '...######...',
    '....####....',
    '.....##.....',
    '............',
  ],
  edit: [
    '............',
    '........##..',
    '.......####.',
    '......####..',
    '.....####...',
    '....####....',
    '...####.....',
    '..####......',
    '..###.......',
    '..##........',
    '............',
    '............',
  ],
  delete: [
    '............',
    '....####....',
    '.##########.',
    '.##########.',
    '..#......#..',
    '..#.#..#.#..',
    '..#.#..#.#..',
    '..#.#..#.#..',
    '..#.#..#.#..',
    '..#......#..',
    '..########..',
    '............',
  ],
  copy: [
    '............',
    '..######....',
    '..#....#....',
    '..#.######..',
    '..#.#....#..',
    '..#.#....#..',
    '..#.#....#..',
    '..###....#..',
    '....#....#..',
    '....######..',
    '............',
    '............',
  ],
  check: [
    '............',
    '............',
    '............',
    '.........##.',
    '........##..',
    '..##...##...',
    '...##.##....',
    '....###.....',
    '.....#......',
    '............',
    '............',
    '............',
  ],
  close: [
    '............',
    '............',
    '..##....##..',
    '...##..##...',
    '....####....',
    '.....##.....',
    '....####....',
    '...##..##...',
    '..##....##..',
    '............',
    '............',
    '............',
  ],
  lock: [
    '............',
    '....####....',
    '...#....#...',
    '...#....#...',
    '..########..',
    '..########..',
    '..###..###..',
    '..###..###..',
    '..########..',
    '..########..',
    '............',
    '............',
  ],
};

export function PixelIcon({ name, className }: { name: IconName; className?: string }) {
  return <PixelArt rows={icons[name]} cell={2} className={className ? `arca-icon ${className}` : 'arca-icon'} />;
}

/* ------------------------------------------------------------------------------------------------
 * Domain marks (02 §8.3). JOY is an observation lamp: a cyan lens with a bright still core, no face
 * expression and no state that reacts to the user's text.
 * ---------------------------------------------------------------------------------------------- */

const joyLens: readonly string[] = [
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

/** JOY mark at 48px (4 CSS px per cell). Decorative; the sender label is real text next to it. */
export function JoyMark({ cell = 4 }: { cell?: number }) {
  return <PixelArt rows={joyLens} cell={cell} className="arca-joy-mark" />;
}

/* Memory fragment: a small stored record with a stepped casing and engraved lines. */
const fragment: readonly string[] = [
  '..............',
  '....MMMMMM....',
  '...MmmmmmmM...',
  '..MmmwwmmmnM..',
  '..MmmmmmmmnM..',
  '..MmmMMMmmnM..',
  '..MmmmmmmmnM..',
  '..MmmMMMmmnM..',
  '..MmmmmmmnnM..',
  '...MnnnnnnM...',
  '....MMMMMM....',
  '..............',
];

export function MemoryFragment({ cell = 4 }: { cell?: number }) {
  return <PixelArt rows={fragment} cell={cell} className="arca-fragment" />;
}

/* F02 glowing fragment: three stepped halo rings (Manhattan distance 1~3 from the silhouette) around
 * the same fragment. CSS breathes the rings on a 3 s cycle; the halo widens as it brightens. */
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

/* ------------------------------------------------------------------------------------------------
 * Intro scenes (AST-004, code as the adopted reference original). Six still scenes: discovery →
 * the voyage → Soi and JOY → the reason → JOY and memory → boarding. Authored with small paint
 * helpers on a 56×30 grid.
 * ---------------------------------------------------------------------------------------------- */

const SCENE_W = 56;
const SCENE_H = 30;

function canvas(): string[][] {
  return Array.from({ length: SCENE_H }, () => Array.from({ length: SCENE_W }, () => '.'));
}

function rect(grid: string[][], x: number, y: number, w: number, h: number, ch: string) {
  for (let yy = y; yy < y + h; yy += 1) {
    const row = grid[yy];
    if (!row) continue;
    for (let xx = x; xx < x + w; xx += 1) if (xx >= 0 && xx < SCENE_W) row[xx] = ch;
  }
}

function plot(grid: string[][], points: readonly (readonly [number, number])[], ch: string) {
  for (const [x, y] of points) {
    const row = grid[y];
    if (row && x >= 0 && x < SCENE_W) row[x] = ch;
  }
}

/** Sparse still stars; a fixed set so the scene never moves (01 §3 forbids animated star dust). */
const stars: readonly (readonly [number, number])[] = [
  [3, 2],
  [9, 6],
  [14, 1],
  [21, 4],
  [27, 2],
  [33, 7],
  [40, 3],
  [45, 6],
  [6, 12],
  [44, 13],
  [2, 18],
  [19, 19],
  [36, 17],
];

function rowsOf(grid: string[][]): string[] {
  return grid.map((row) => row.join(''));
}

/** A window, sill and foreground console establish depth without painting behind any text. */
function windowFrame(g: string[][]) {
  rect(g, 2, 1, 52, 23, 'R');
  rect(g, 1, 3, 54, 19, 'R');
  rect(g, 4, 3, 48, 18, 'C');
  plot(
    g,
    stars.filter(([x, y]) => x > 4 && y > 3 && y < 20),
    'l',
  );
  rect(g, 4, 23, 48, 1, 'l');
  rect(g, 0, 25, 56, 3, 'i');
  rect(g, 7, 26, 12, 1, 't');
  rect(g, 8, 26, 2, 1, 's');
  rect(g, 43, 26, 6, 1, 'R');
}

/** One passenger, 4×8, facing right; the parallel self is the same figure mirrored. */
const figure: readonly string[] = ['.gg.', '.gg.', 'gggg', '.ggg', '.gg.', '.gg.', '.g.g', '.g.g'];

/** Paints a figure whose feet rest on the highest world cell under its four columns. */
function stand(g: string[][], x: number, mirrored: boolean, ch: string) {
  let ground = SCENE_H;
  for (let dx = 0; dx < 4; dx += 1) {
    for (let y = 4; y < ground; y += 1) {
      const cell = g[y]?.[x + dx];
      if (cell === 'T' || cell === 't' || cell === 'N' || cell === 'n') {
        ground = y;
        break;
      }
    }
  }
  figure.forEach((row, dy) => {
    const cells = mirrored ? [...row].reverse() : [...row];
    cells.forEach((cell, dx) => {
      if (cell !== '.') rect(g, x + dx, ground - figure.length + dy, 1, 1, ch);
    });
  });
}

/** Two mirrored worlds; `near` removes the rift and puts a small warm story light between the selves. */
function sceneMirror(near: boolean): string[] {
  const g = canvas();
  rect(g, 1, 1, 54, 27, 'R');
  rect(g, 2, 2, 52, 25, 'C');
  plot(
    g,
    stars.filter(([x, y]) => x > 2 && y > 2 && y < 16),
    'l',
  );
  for (let y = 2; y < 27; y += 1) {
    for (let x = 2; x < 54; x += 1) {
      const left = Math.hypot(x - 12, y - 40);
      const right = Math.hypot(x - 43, y - 40);
      if (left <= 21.9) rect(g, x, y, 1, 1, left > 20.7 ? 't' : 'T');
      if (right <= 21.9) rect(g, x, y, 1, 1, right > 20.7 ? 'n' : 'N');
    }
  }
  if (near) {
    stand(g, 15, false, 'g');
    stand(g, 37, true, 'M');
    rect(g, 27, 13, 2, 2, 'a');
  } else {
    for (let y = 3; y < 26; y += 2) rect(g, 27, y, 2, 1, 'S');
    stand(g, 9, false, 'g');
    stand(g, 43, true, 'M');
  }
  return rowsOf(g);
}

/** Soi's workshop: pinned questions and answers on the wall, JOY's cabinet by the bench. */
function sceneWorkshop(): string[] {
  const g = canvas();
  rect(g, 2, 2, 52, 22, 'R');
  rect(g, 4, 4, 48, 18, 'i');
  rect(g, 6, 5, 12, 7, 'C');
  plot(
    g,
    [
      [8, 7],
      [14, 6],
      [11, 10],
    ],
    'l',
  );
  rect(g, 6, 12, 12, 1, 't');
  // Question cards, a few already turned into memory.
  for (const [x, y, ch] of [
    [21, 5, 'g'],
    [25, 5, 'M'],
    [29, 5, 'g'],
    [21, 8, 'M'],
    [25, 8, 'g'],
    [29, 8, 'm'],
  ] as const) {
    rect(g, x, y, 3, 2, ch);
  }
  rect(g, 20, 4, 13, 1, 'l');
  rect(g, 37, 5, 14, 14, 'c');
  joyLens.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      if (ch && ch !== '.') rect(g, 38 + x, 6 + y, 1, 1, ch);
    }
  });
  rect(g, 37, 18, 14, 4, 'R');
  rect(g, 39, 19, 2, 1, 's');
  rect(g, 42, 19, 2, 1, 'S');
  rect(g, 45, 19, 4, 1, 't');
  rect(g, 4, 22, 48, 1, 'l');
  rect(g, 4, 23, 48, 2, 'R');
  rect(g, 0, 25, 56, 3, 'i');
  rect(g, 8, 25, 2, 2, 'R');
  rect(g, 46, 25, 2, 2, 'R');
  rect(g, 10, 21, 8, 1, 't');
  rect(g, 12, 20, 3, 1, 'a');
  figure.forEach((row, dy) => {
    [...row].forEach((cell, dx) => {
      if (cell !== '.') rect(g, 31 + dx, 14 + dy, 1, 1, 'g');
    });
  });
  return rowsOf(g);
}

function sceneVoyage(): string[] {
  const g = canvas();
  windowFrame(g);
  // A dim distant limb beyond the ship.
  rect(g, 44, 7, 8, 14, 'T');
  rect(g, 47, 5, 5, 2, 'T');
  rect(g, 50, 4, 2, 1, 't');
  rect(g, 49, 9, 3, 12, 'c');
  // Long stepped hull: subdued structure, small cabin lights.
  rect(g, 12, 11, 25, 4, 'l');
  rect(g, 10, 12, 29, 2, 'g');
  rect(g, 37, 12, 6, 1, 'l');
  rect(g, 12, 15, 25, 2, 'R');
  rect(g, 16, 17, 15, 1, 'i');
  rect(g, 20, 9, 9, 2, 'R');
  rect(g, 23, 8, 4, 1, 'l');
  rect(g, 23, 9, 4, 1, 's');
  rect(g, 8, 12, 2, 2, 't');
  rect(g, 6, 12, 2, 1, 's');
  for (let x = 15; x < 34; x += 4) rect(g, x, 12, 2, 1, 's');
  rect(g, 13, 14, 21, 1, 'B');
  return rowsOf(g);
}

function sceneJoy(): string[] {
  const g = canvas();
  // The lens is mounted on a wall beside a sleeping pod, not floating in space.
  rect(g, 2, 2, 52, 22, 'R');
  rect(g, 4, 4, 48, 18, 'i');
  rect(g, 6, 5, 24, 11, 'C');
  plot(
    g,
    [
      [9, 8],
      [16, 6],
      [26, 11],
    ],
    'l',
  );
  rect(g, 6, 17, 24, 1, 't');
  rect(g, 33, 4, 16, 15, 'c');
  joyLens.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      if (ch && ch !== '.') rect(g, 35 + x, 5 + y, 1, 1, ch);
    }
  });
  rect(g, 39, 17, 4, 1, 't');
  rect(g, 0, 25, 56, 3, 'i');
  rect(g, 12, 21, 31, 4, 'l');
  rect(g, 10, 22, 35, 2, 'R');
  rect(g, 16, 19, 23, 2, 't');
  rect(g, 17, 18, 21, 1, 'S');
  rect(g, 17, 20, 21, 2, 'C');
  rect(g, 20, 20, 3, 1, 'g');
  rect(g, 24, 21, 10, 1, 'R');
  rect(g, 14, 25, 4, 2, 'R');
  rect(g, 38, 25, 4, 2, 'R');
  rect(g, 43, 20, 3, 1, 'm');
  return rowsOf(g);
}

function sceneBoarding(): string[] {
  const g = canvas();
  rect(g, 4, 2, 48, 23, 'R');
  rect(g, 8, 4, 40, 21, 'i');
  rect(g, 14, 5, 28, 18, 'l');
  rect(g, 16, 6, 24, 17, 'C');
  rect(g, 20, 8, 16, 14, 'R');
  rect(g, 22, 9, 12, 13, 'c');
  rect(g, 26, 10, 4, 12, 'T');
  rect(g, 27, 10, 2, 10, 's');
  // Receding capsule bays and a narrow floor mark imply the long hibernation deck.
  for (const y of [9, 14, 19]) {
    rect(g, 9, y, 4, 2, 't');
    rect(g, 43, y, 4, 2, 't');
    rect(g, 10, y, 2, 1, 'g');
    rect(g, 44, y, 2, 1, 'g');
  }
  rect(g, 12, 24, 32, 1, 'l');
  rect(g, 8, 26, 40, 2, 'i');
  rect(g, 25, 23, 6, 1, 't');
  rect(g, 23, 26, 10, 1, 't');
  rect(g, 20, 4, 16, 1, 'S');
  return rowsOf(g);
}

function sceneObservation(): string[] {
  const g = canvas();
  rect(g, 1, 1, 54, 13, 'R');
  rect(g, 3, 2, 50, 10, 'C');
  plot(
    g,
    [
      [8, 4],
      [20, 6],
      [28, 3],
      [48, 5],
    ],
    'l',
  );
  rect(g, 37, 4, 8, 8, 'T');
  rect(g, 39, 3, 6, 1, 't');
  rect(g, 41, 6, 4, 6, 'c');
  rect(g, 3, 12, 50, 1, 't');
  rect(g, 0, 15, 56, 2, 'i');
  rect(g, 4, 11, 12, 4, 'R');
  rect(g, 6, 12, 8, 2, 'T');
  rect(g, 7, 12, 2, 1, 's');
  rect(g, 11, 12, 2, 1, 'S');
  rect(g, 47, 14, 4, 1, 'l');
  return rowsOf(g).slice(0, 18);
}

const observation = sceneObservation();

/** Small static diorama above today's question; it never reacts to an answer. */
export function ObservationScene() {
  return <PixelArt rows={observation} className="arca-observation-art" />;
}

export const introScenes: readonly (readonly string[])[] = [
  sceneMirror(false),
  sceneVoyage(),
  sceneWorkshop(),
  sceneMirror(true),
  sceneJoy(),
  sceneBoarding(),
];

/** Code scene: the static fallback when the scene image fails (AST-004), 5→6 CSS px per cell. */
function IntroSceneArt({ index }: { index: number }) {
  const rows = introScenes[index] ?? introScenes[0];
  if (!rows) return null;
  return <PixelArt rows={rows} className="arca-scene-art arca-intro-art" />;
}

/* Adopted AST-004 images: 156×156-cell square sources (design/assets/AST-004/export). The core sits in
 * the centre strip a portrait phone shows; wider screens reveal background-only sides (02 §8.1).
 * `no-inline` keeps each scene its own file so scenes 2~6 can load later (06 §10.5). */
const introSceneImages: readonly string[] = [scene1, scene2, scene3, scene4, scene5, scene6];

/** Scenes 2~6 load at idle once the intro is showing (06 §10.5); the first scene loads with the page. */
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

/**
 * Full-screen intro scene. The image covers the width at a whole number of CSS px per cell, top-aligned
 * and centred (ui.css). On a scene change the next image settles over the previous one, which stays
 * underneath until the step fade ends; Reduced Motion swaps at once. A scene that fails to load falls
 * back to its code scene.
 */
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
      {previous ? <img key={previous} className="arca-intro-scene" src={previous} alt="" /> : null}
      <img
        key={src}
        className={previous ? 'arca-intro-scene arca-intro-scene--entering' : 'arca-intro-scene'}
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

/** F20 empty state: an unlit pod row waiting for the first fragment (AST-007). */
const emptyArchive: readonly string[] = [
  '................................',
  '.......RRRRRRRRRRRRRRRRRR.......',
  '.....RRiiiiiiiiiiiiiiiiiiRR.....',
  '.....RiiiiiiiiiiiiiiiiiiiiR.....',
  '.....RiiiiiiiiiiiiiiiiiiiiR.....',
  '.....RRiiiiiiiiiiiiiiiiiiRR.....',
  '.......RRRRRRRRRRRRRRRRRR.......',
  '..........BBBBBBBBBBBB..........',
  '................................',
];

export function EmptyArchiveArt() {
  return <PixelArt rows={emptyArchive} cell={4} className="arca-scene-art" />;
}
