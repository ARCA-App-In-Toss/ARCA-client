import type { AnonymousKeyResult } from '../platform/ports.ts';
import { mockErrors } from './handlers.ts';
import { createMockWorld, type MockWorld, type ServerBase, SYNTHETIC_KEYS } from './world.ts';

// Named dev/test starting points (07 §4). Selected only by env/test helper, never by URL or Storage.
export interface ScenarioDefinition {
  id: string;
  base: ServerBase;
  anonymousKey: AnonymousKeyResult;
  setup?: (world: MockWorld) => void;
}

export const scenarios: Record<string, ScenarioDefinition> = {
  'MS-SES-001-active': {
    id: 'MS-SES-001',
    base: 'server.activeUnanswered',
    anonymousKey: { kind: 'ok', key: SYNTHETIC_KEYS.registered },
  },
  'MS-SES-001-pre': {
    id: 'MS-SES-001',
    base: 'server.prePassenger',
    anonymousKey: { kind: 'ok', key: SYNTHETIC_KEYS.unregistered },
  },
  'MS-SES-002': {
    id: 'MS-SES-002',
    base: 'server.activeUnanswered',
    anonymousKey: { kind: 'unavailable', reason: 'error' },
  },
  // Draft written just before midnight, first saved after it (07 MS-TIME-002 → F13, then the Sheet).
  'MS-TIME-002': {
    id: 'MS-TIME-002',
    base: 'server.activeUnanswered',
    anonymousKey: { kind: 'ok', key: SYNTHETIC_KEYS.registered },
    setup: (world) => {
      world.advanceDayOnFirstPrepare = true;
    },
  },
  // 21 records across a month boundary: the first page, "기록 더 보기", edit and delete (07 MS-LIST-003/004).
  'MS-LIST-003': {
    id: 'MS-LIST-003',
    base: 'server.activeUnanswered',
    anonymousKey: { kind: 'ok', key: SYNTHETIC_KEYS.registered },
    setup: (world) => {
      const newest = Date.parse('2026-09-10T01:00:00Z');
      for (let i = 0; i < 21; i += 1) {
        const at = new Date(newest - i * 86_400_000).toISOString();
        world.seedAnswer(SYNTHETIC_KEYS.registered, `합성 기록 ${i + 1} (synthetic/non-user)`, {
          dailySemaId: `synthetic-day-list-${i}`,
          createdAt: at,
          createdDateKst: at.slice(0, 10),
        });
      }
    },
  },
  'start-maintenance': {
    id: 'MS-SES-001',
    base: 'server.activeUnanswered',
    anonymousKey: { kind: 'ok', key: SYNTHETIC_KEYS.registered },
    setup: (world) => world.addFault('OP-001', mockErrors.maintenance),
  },
};

export function createScenarioWorld(name: string): { world: MockWorld; definition: ScenarioDefinition } {
  const definition = scenarios[name];
  if (!definition) throw new Error(`unknown mock scenario: ${name}`);
  const world = createMockWorld(definition.base);
  definition.setup?.(world);
  return { world, definition };
}
