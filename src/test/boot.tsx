import { render, screen, waitFor } from '@testing-library/react';
import type { SetupServer } from 'msw/node';
import { createMemoryRouter } from 'react-router';
import { expect } from 'vitest';
import { App } from '../app/App.tsx';
import { createAppServices } from '../app/composition.ts';
import { paths, routes } from '../app/routes.tsx';
import type { AnonymousKeyResult } from '../domain/ports/platform.ts';
import { createHandlers } from '../mocks/handlers.ts';
import { createFakePlatform, type FakeStorage } from '../mocks/platform.ts';
import { createMockWorld, MOCK_API_BASE, type MockWorld, type ServerBase, SYNTHETIC_KEYS } from '../mocks/world.ts';

export interface BootOptions {
  base?: ServerBase;
  key?: AnonymousKeyResult;
  storage?: FakeStorage;
  initialPath?: string;
  world?: MockWorld;
  now?: () => number;
}

export function bootApp(server: SetupServer, options: BootOptions = {}) {
  const world = options.world ?? createMockWorld(options.base ?? 'server.activeUnanswered');
  server.use(...createHandlers(world));
  const platform = createFakePlatform({
    anonymousKey: options.key ?? { kind: 'ok', key: SYNTHETIC_KEYS.registered },
    ...(options.storage ? { storage: options.storage } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  const services = createAppServices({ platform, apiBase: MOCK_API_BASE });
  const router = createMemoryRouter(routes, { initialEntries: [options.initialPath ?? paths.start] });
  const started = services.start();
  const view = render(<App services={services} router={router} />);
  return { world, platform, services, router, started, view };
}

export const findTitle = (name: string) => screen.findByRole('heading', { level: 1, name });

export async function findFocusedTitle(name: string) {
  const title = await findTitle(name);
  await waitFor(() => expect(title).toHaveFocus());
  return title;
}

export const opCount = (world: MockWorld, op: string) => world.requests.filter((r) => r.op === op).length;
