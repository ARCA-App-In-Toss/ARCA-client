import { PixelArt } from './art.tsx';
import { joyLens } from './marks.tsx';

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

const figure: readonly string[] = ['.gg.', '.gg.', 'gggg', '.ggg', '.gg.', '.gg.', '.g.g', '.g.g'];

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
  rect(g, 44, 7, 8, 14, 'T');
  rect(g, 47, 5, 5, 2, 'T');
  rect(g, 50, 4, 2, 1, 't');
  rect(g, 49, 9, 3, 12, 'c');
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
