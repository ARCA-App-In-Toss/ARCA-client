import { render, screen } from '@testing-library/react';
import type { SetupServer } from 'msw/node';
import { createMemoryRouter } from 'react-router';
import { App } from '../app/App.tsx';
import { createAppServices } from '../app/composition.ts';
import { paths, routes } from '../app/routes.tsx';
import { createHandlers } from '../mocks/handlers.ts';
import { createFakePlatform, type FakeStorage } from '../mocks/platform.ts';
import { createMockWorld, MOCK_API_BASE, type MockWorld, type ServerBase, SYNTHETIC_KEYS } from '../mocks/world.ts';
import type { AnonymousKeyResult } from '../platform/ports.ts';

export interface BootOptions {
  base?: ServerBase;
  key?: AnonymousKeyResult;
  storage?: FakeStorage;
  initialPath?: string;
  world?: MockWorld;
}

/** Full app on a memory router against the MSW mock world (component + MSW layer, 08 §3.2). */
export function bootApp(server: SetupServer, options: BootOptions = {}) {
  const world = options.world ?? createMockWorld(options.base ?? 'server.activeUnanswered');
  server.use(...createHandlers(world));
  const platform = createFakePlatform({
    anonymousKey: options.key ?? { kind: 'ok', key: SYNTHETIC_KEYS.registered },
    ...(options.storage ? { storage: options.storage } : {}),
  });
  const services = createAppServices({ platform, apiBase: MOCK_API_BASE });
  const router = createMemoryRouter(routes, { initialEntries: [options.initialPath ?? paths.start] });
  const started = services.start();
  const view = render(<App services={services} router={router} />);
  return { world, platform, services, router, started, view };
}

export const findTitle = (name: string) => screen.findByRole('heading', { level: 1, name });

export const opCount = (world: MockWorld, op: string) => world.requests.filter((r) => r.op === op).length;
