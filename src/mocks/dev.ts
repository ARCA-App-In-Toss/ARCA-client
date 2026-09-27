import { setupWorker } from 'msw/browser';
import { type AppServices, createAppServices } from '../app/composition.ts';
import { createHandlers } from './handlers.ts';
import { createFakePlatform } from './platform.ts';
import { createScenarioWorld } from './scenarios.ts';
import { MOCK_API_BASE } from './world.ts';

/**
 * Dev-server only (imported behind `import.meta.env.DEV`). Synthetic platform and MSW world; the
 * device storage is in-memory and resets on reload, which models a fresh device, not persistence.
 */
export async function startDevMock(scenarioName: string): Promise<AppServices> {
  const { world, definition } = createScenarioWorld(scenarioName);
  const worker = setupWorker(...createHandlers(world));
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
  const platform = createFakePlatform({ anonymousKey: definition.anonymousKey });
  return createAppServices({ platform, apiBase: MOCK_API_BASE });
}
