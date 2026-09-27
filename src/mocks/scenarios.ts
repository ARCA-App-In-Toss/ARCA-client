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
