import { describe, expect, test } from 'vitest';
import { skyPhaseAt } from './sky.ts';

describe('capsule sky phase by device hour', () => {
  test.each([
    [0, 'night'],
    [4, 'night'],
    [5, 'dawn'],
    [7, 'dawn'],
    [8, 'day'],
    [16, 'day'],
    [17, 'dusk'],
    [19, 'dusk'],
    [20, 'night'],
    [23, 'night'],
  ] as const)('%i시 → %s', (hour, phase) => {
    expect(skyPhaseAt(hour)).toBe(phase);
  });
});
