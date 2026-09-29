import type { CSSProperties } from 'react';

export type Palette = Record<string, string>;

export const defaultPalette: Palette = {
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

export function runsOf(rows: readonly string[], palette: Palette): Run[] {
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
  cell?: number;
  palette?: Palette;
  label?: string;
  className?: string;
  style?: CSSProperties;
}

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
