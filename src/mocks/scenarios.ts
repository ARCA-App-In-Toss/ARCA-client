import type { AnonymousKeyResult } from '../platform/ports.ts';
import { seedDemo } from './demo.ts';
import { mockErrors } from './handlers.ts';
import { createMockWorld, type MockWorld, type ServerBase, SYNTHETIC_KEYS } from './world.ts';

// Named dev/test starting points (07 §4). Selected only by env/test helper, never by URL or Storage.
export interface ScenarioDefinition {
  id: string;
  base: ServerBase;
  anonymousKey: AnonymousKeyResult;
  setup?: (world: MockWorld) => void;
}

/** Short fictional lines for the 21-record list; the index suffix keeps rows distinguishable. */
const LIST_TEXTS = [
  '역 뒤편 공원의 세 번째 벤치에서 한 정거장을 걸을지 고민했다.',
  '천천히 해도 괜찮아. 늦은 게 아니라 네 속도야.',
  '출근길에 같은 곡을 열 번 넘게 들었다.',
  '퇴근하고 켜지는 주황색 스탠드 하나면 충분하다.',
  '혼자 영화관에 갔다. 엔딩 크레딧을 끝까지 본 건 처음이다.',
  '결정을 미루는 나 자신.',
  '"늦게라도 꼭 답장하는 사람."',
];

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
        world.seedAnswer(SYNTHETIC_KEYS.registered, `${LIST_TEXTS[i % LIST_TEXTS.length]} (${i + 1})`, {
          dailySemaId: `synthetic-day-list-${i}`,
          createdAt: at,
          createdDateKst: at.slice(0, 10),
        });
      }
    },
  },
  // Design review: a fictional passenger with a month of realistic records (dev only, `pnpm dev:demo`).
  demo: {
    id: 'demo',
    base: 'server.activeUnanswered',
    anonymousKey: { kind: 'ok', key: SYNTHETIC_KEYS.registered },
    setup: seedDemo,
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
