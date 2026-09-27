import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { setupServer } from 'msw/node';
import { createMemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { queryKeys } from '../../data/query/keys.ts';
import { StorageJournal, storageKeys } from '../../data/storage/journal.ts';
import { createHandlers, mockErrors } from '../../mocks/handlers.ts';
import { createFakePlatform, createFakeStorage, type FakeStorage } from '../../mocks/platform.ts';
import { createMockWorld, MOCK_API_BASE, type ServerBase, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import type { AnonymousKeyResult } from '../../platform/ports.ts';
import { copy } from '../../ui/copy.ts';
import { App } from '../App.tsx';
import { createAppServices } from '../composition.ts';
import { paths, routes } from '../routes.tsx';
import { START_EXCERPT_PROFILE } from './bootstrap.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

interface BootOptions {
  base?: ServerBase;
  key?: AnonymousKeyResult;
  storage?: FakeStorage;
  initialPath?: string;
}

function boot(options: BootOptions = {}) {
  const world = createMockWorld(options.base ?? 'server.activeUnanswered');
  server.use(...createHandlers(world));
  const platform = createFakePlatform({
    anonymousKey: options.key ?? { kind: 'ok', key: SYNTHETIC_KEYS.registered },
    ...(options.storage ? { storage: options.storage } : {}),
  });
  const services = createAppServices({ platform, apiBase: MOCK_API_BASE });
  const router = createMemoryRouter(routes, { initialEntries: [options.initialPath ?? paths.start] });
  const started = services.start();
  render(<App services={services} router={router} />);
  return { world, platform, services, router, started };
}

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });
const ops = (world: ReturnType<typeof createMockWorld>, op: 'OP-001' | 'OP-005') =>
  world.requests.filter((r) => r.op === op).length;

describe('F00 bootstrap branching (IX-032, MS-SES-001)', () => {
  test('shows F00 with one polite status and no private content while starting', async () => {
    let release!: () => void;
    const world = createMockWorld('server.activeUnanswered');
    world.addFault('OP-001', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    server.use(...createHandlers(world));
    const services = createAppServices({ platform: createFakePlatform(), apiBase: MOCK_API_BASE });
    const started = services.start();
    render(<App services={services} router={createMemoryRouter(routes, { initialEntries: [paths.today] })} />);

    expect(await heading(copy['CPY-F00-001'])).toHaveFocus();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(copy['CPY-F00-003']);
    expect(screen.queryByRole('heading', { name: copy['CPY-F10-001'] })).toBeNull();
    expect((await axe.run(document.body)).violations).toEqual([]);
    release();
    await act(() => started);
  });

  test('registered key → ACTIVE → F10 via replace, today seeded under owner/generation key', async () => {
    const { services, router, started } = boot();
    await act(() => started);
    expect(await heading(copy['CPY-F10-001'])).toHaveFocus();
    expect(router.state.location.pathname).toBe(paths.today);
    expect(router.state.historyAction).toBe('REPLACE');

    const session = services.getSnapshot().session;
    const key = queryKeys.today(session?.ownerScope ?? '', session?.generation ?? '', START_EXCERPT_PROFILE);
    expect(services.queryClient.getQueryData(key)).toMatchObject({ dateKst: '2026-09-27' });
  });

  test('unregistered key → PRE_PASSENGER → F01 and no passenger is created', async () => {
    const { world, router, started } = boot({
      base: 'server.prePassenger',
      key: { kind: 'ok', key: SYNTHETIC_KEYS.unregistered },
    });
    await act(() => started);
    expect(await heading(copy['CPY-F01-001'])).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(paths.intro);
    expect(world.passengers.size).toBe(0);
    expect(ops(world, 'OP-005')).toBe(0);
  });

  test('cold start on a route for the wrong mode goes to the confirmed root', async () => {
    const { router, started } = boot({
      base: 'server.prePassenger',
      key: { kind: 'ok', key: SYNTHETIC_KEYS.unregistered },
      initialPath: paths.today,
    });
    await act(() => started);
    await heading(copy['CPY-F01-001']);
    expect(router.state.location.pathname).toBe(paths.intro);
  });
});

describe('F90 start error (MS-SES-002, IX-032)', () => {
  test('anonymous key unavailable → F90 without OP-001, fallback or code area', async () => {
    const { world, platform, started } = boot({ key: { kind: 'unavailable', reason: 'error' } });
    await act(() => started);
    expect(await heading(copy['CPY-F90-001'])).toHaveFocus();
    expect(screen.getByText(copy['CPY-F90-002'])).toBeInTheDocument();
    expect(screen.queryByText(copy['CPY-F90-005'])).toBeNull();
    expect(ops(world, 'OP-001')).toBe(0);
    expect(platform.storage.data.size).toBe(0);
    expect((await axe.run(document.body)).violations).toEqual([]);
  });

  test('maintenance shows its message and the server request id; copy success is announced', async () => {
    const { world, platform, started } = boot();
    world.addFault('OP-001', mockErrors.maintenance);
    await act(() => started);
    await heading(copy['CPY-F90-001']);
    expect(screen.getByText(copy['CPY-F90-004'])).toBeInTheDocument();
    expect(screen.getByText('synthetic-req-maintenance')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F90-011'] }));
    expect(platform.clipboardWrites).toEqual(['synthetic-req-maintenance']);
    expect(screen.getByRole('status')).toHaveTextContent(copy['CPY-F90-012']);
  });

  test('copy failure keeps a direct selection path and moves focus to the code', async () => {
    const { world, platform, started } = boot();
    world.addFault('OP-001', mockErrors.maintenance);
    await act(() => started);
    await heading(copy['CPY-F90-001']);
    platform.setClipboardFails(true);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F90-011'] }));
    expect(screen.getByRole('status')).toHaveTextContent(copy['CPY-F90-013']);
    expect(screen.getByText('synthetic-req-maintenance')).toHaveFocus();
  });

  test('offline transport failure uses the offline message', async () => {
    const { world, platform, started } = boot();
    platform.setOffline(true);
    world.addFault('OP-001', { kind: 'network' });
    await act(() => started);
    await heading(copy['CPY-F90-001']);
    expect(screen.getByText(copy['CPY-F90-003'])).toBeInTheDocument();
  });

  test('support unavailable is reported honestly', async () => {
    const { started } = boot({ key: { kind: 'unavailable', reason: 'unsupported' } });
    await act(() => started);
    await heading(copy['CPY-F90-001']);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F90-008'] }));
    expect(screen.getByRole('status')).toHaveTextContent(copy['CPY-F90-014']);
  });

  test('reconnect: duplicate presses are blocked, failure keeps F90, success replaces to F10', async () => {
    const { world, platform, services, router, started } = boot({ key: { kind: 'unavailable', reason: 'error' } });
    await act(() => started);
    await heading(copy['CPY-F90-001']);

    let release!: () => void;
    world.addFault('OP-001', {
      kind: 'hold',
      release: new Promise<void>((r) => (release = r)),
      after: mockErrors.maintenance,
    });
    platform.setAnonymousKey({ kind: 'ok', key: SYNTHETIC_KEYS.registered });
    const reconnect = screen.getByRole('button', { name: copy['CPY-F90-007'] });
    await userEvent.click(reconnect);
    expect(reconnect).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(copy['CPY-F90-009']);
    await userEvent.click(reconnect);
    release();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(copy['CPY-F90-010']));
    // Initial start sent none (key unavailable); the blocked duplicate press sent none either.
    expect(ops(world, 'OP-001')).toBe(1);
    expect(world.passengers.size).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F90-007'] }));
    expect(await heading(copy['CPY-F10-001'])).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(paths.today);
    expect(router.state.historyAction).toBe('REPLACE');
    expect(services.getSnapshot().bootstrap.phase).toBe('ready');
  });
});

describe('local area before first screen (06 §5.3, §8)', () => {
  test('both root copies damaged → F90 and today is not requested', async () => {
    const storage = createFakeStorage();
    storage.data.set(storageKeys.root('a'), '{"broken":');
    storage.data.set(storageKeys.root('b'), '{"broken":');
    const { world, started } = boot({ storage });
    await act(() => started);
    await heading(copy['CPY-F90-001']);
    expect(ops(world, 'OP-005')).toBe(0);
  });

  test('generation change removes the old area before F10 (MS-SES-004 local side)', async () => {
    const storage = createFakeStorage();
    const seed = new StorageJournal(storage, { now: () => 0 });
    await seed.initArea({ kind: 'generation', ref: 'old-area' });
    await seed.putRecord({ kind: 'generation', ref: 'old-area' }, 'draft:x', { text: 'synthetic old body' });
    await seed.updateRoot(() => ({
      currentGeneration: 'gen-old',
      routeEpoch: 3,
      generations: [{ generation: 'gen-old', ref: 'old-area' }],
    }));

    const { started } = boot({ storage });
    await act(() => started);
    await heading(copy['CPY-F10-001']);

    const keys = [...storage.data.keys()];
    expect(keys.some((k) => k.includes('old-area'))).toBe(false);
    expect([...storage.data.values()].some((v) => v.includes('synthetic old body'))).toBe(false);
    const root = await new StorageJournal(storage, { now: () => 0 }).readRoot();
    expect(root).toMatchObject({ currentGeneration: 'gen-synthetic-1', routeEpoch: 4 });
    expect(root?.generations.map((g) => g.generation)).toEqual(['gen-synthetic-1']);
  });

  test('restart on the same generation keeps the area and does not bump route epoch', async () => {
    const storage = createFakeStorage();
    const first = boot({ storage });
    await act(() => first.started);
    await heading(copy['CPY-F10-001']);
    const before = await new StorageJournal(storage, { now: () => 0 }).readRoot();

    const second = boot({ storage });
    await act(() => second.started);
    const after = await new StorageJournal(storage, { now: () => 0 }).readRoot();
    expect(after).toEqual(before);
  });
});

describe('mid-visit session changes (06 §5.4, MS-SES-004)', () => {
  const runToday = (services: ReturnType<typeof boot>['services']) =>
    services.session.run('ACTIVE', (auth) => services.api.getToday(auth, START_EXCERPT_PROFILE));

  test('ACTIVE → PRE on recovery: no replay, cache cleared, local area reconciled, routed to F01', async () => {
    const storage = createFakeStorage();
    const { world, services, router, started } = boot({ storage });
    await act(() => started);
    await heading(copy['CPY-F10-001']);

    world.revokeSessions(SYNTHETIC_KEYS.registered);
    world.passengers.clear();
    await act(async () => {
      await expect(runToday(services)).rejects.toMatchObject({ name: 'SessionChangedFailure' });
    });

    expect(await heading(copy['CPY-F01-001'])).toHaveFocus();
    expect(router.state.location.pathname).toBe(paths.intro);
    expect(ops(world, 'OP-001')).toBe(2);
    expect(ops(world, 'OP-005')).toBe(2);
    expect(services.queryClient.getQueryCache().getAll()).toHaveLength(0);
    const root = await new StorageJournal(storage, { now: () => 0 }).readRoot();
    expect(root).toMatchObject({ currentGeneration: null, generations: [] });
  });

  test('generation change mid-visit removes the previous area before F10 reopens', async () => {
    const storage = createFakeStorage();
    const { world, services, started } = boot({ storage });
    await act(() => started);
    await heading(copy['CPY-F10-001']);
    const before = await new StorageJournal(storage, { now: () => 0 }).readRoot();
    const oldRef = before?.generations[0]?.ref ?? '';

    world.revokeSessions(SYNTHETIC_KEYS.registered);
    const passenger = world.passengers.get(SYNTHETIC_KEYS.registered);
    if (passenger) passenger.dataGeneration = 'gen-synthetic-2';
    await act(async () => {
      await expect(runToday(services)).rejects.toMatchObject({ name: 'SessionChangedFailure' });
    });

    await waitFor(() => expect(services.getSnapshot().bootstrap.phase).toBe('ready'));
    expect(await heading(copy['CPY-F10-001'])).toBeInTheDocument();
    const after = await new StorageJournal(storage, { now: () => 0 }).readRoot();
    expect(after?.currentGeneration).toBe('gen-synthetic-2');
    expect([...storage.data.keys()].some((k) => k.includes(oldRef))).toBe(false);
  });

  test('owner cannot be confirmed mid-visit: private screen closes and F00 re-runs to F90', async () => {
    const { world, platform, services, router, started } = boot();
    await act(() => started);
    await heading(copy['CPY-F10-001']);

    world.revokeSessions(SYNTHETIC_KEYS.registered);
    platform.setAnonymousKey({ kind: 'unavailable', reason: 'error' });
    await act(async () => {
      await expect(runToday(services)).rejects.toMatchObject({ name: 'IdentityUnavailableFailure' });
    });

    expect(await heading(copy['CPY-F90-001'])).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(paths.startError);
    expect(screen.queryByRole('heading', { name: copy['CPY-F10-001'] })).toBeNull();
  });
});
