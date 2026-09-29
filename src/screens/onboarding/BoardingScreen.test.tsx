import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { createFakeStorage } from '../../mocks/platform.ts';
import { createMockWorld, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { bootApp, findTitle, opCount } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function bootBoarding(options: Parameters<typeof bootApp>[1] = {}) {
  const booted = bootApp(server, { base: 'server.prePassenger', initialPath: paths.join, ...options });
  await act(() => booted.started);
  await findTitle(copy['CPY-F02-001']);
  return booted;
}

const terms = () => screen.getByRole('checkbox', { name: copy['CPY-F02-015'] });
const privacy = () => screen.getByRole('checkbox', { name: copy['CPY-F02-016'] });
const privacyLabel = () => screen.getAllByText(copy['CPY-F02-019'])[1] as HTMLElement;
const boardButton = () => screen.getByRole('button', { name: copy['CPY-F02-010'] });

async function agreeBoth() {
  await userEvent.click(terms());
  await userEvent.click(privacyLabel());
}

describe('F02 boarding (IX-031, MS-ONB-001/002)', () => {
  test('partial consent sends nothing; both consents create the passenger and hand ACTIVE to F03 → F10', async () => {
    const { world, router, platform } = await bootBoarding();

    await userEvent.click(terms());
    expect(boardButton()).toHaveAttribute('aria-disabled', 'true');
    expect(boardButton()).toHaveAccessibleDescription(copy['CPY-F02-009']);
    await userEvent.click(boardButton());
    expect(opCount(world, 'OP-003')).toBe(0);

    await userEvent.click(privacyLabel());
    expect(privacy()).toBeChecked();
    expect(boardButton()).not.toHaveAttribute('aria-disabled');
    await userEvent.click(boardButton());

    expect(await findTitle(copy['CPY-F03-001'])).toHaveFocus();
    expect(router.state.location.pathname).toBe(paths.joinComplete);
    expect(screen.getByText('SYN-1001')).toBeInTheDocument();
    expect(opCount(world, 'OP-003')).toBe(1);
    expect(world.passengers.has(SYNTHETIC_KEYS.registered)).toBe(true);
    expect([...platform.storage.data.keys()].filter((key) => key.includes(':pre:'))).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F03-013'] }));
    expect(await findTitle(copy['CPY-F10-001'])).toHaveFocus();
    expect(router.state.location.pathname).toBe(paths.today);

    await act(() => router.navigate(paths.joinComplete));
    await findTitle(copy['CPY-F10-001']);
  });

  test('version change before submit creates nothing, unchecks only the changed policy, then succeeds', async () => {
    const { world } = await bootBoarding();
    await agreeBoth();
    const [first] = world.policies;
    if (first) world.policies[0] = { ...first, version: 'synthetic-v2' };

    await userEvent.click(boardButton());
    expect(await screen.findByText(copy['CPY-F02-012'])).toBeInTheDocument();
    expect(world.passengers.size).toBe(0);
    expect(terms()).not.toBeChecked();
    expect(privacy()).toBeChecked();

    await userEvent.click(terms());
    await userEvent.click(boardButton());
    await findTitle(copy['CPY-F03-001']);
    expect(world.creations).toHaveLength(1);
  });

  test('MS-ONB-002 response lost after commit: OP-001 re-exchange, same ID resent, one passenger, F03', async () => {
    const { world, router } = await bootBoarding();
    world.addFault('OP-003', { kind: 'lose-response' });
    await agreeBoth();
    await userEvent.click(boardButton());

    await findTitle(copy['CPY-F03-001']);
    expect(router.state.location.pathname).toBe(paths.joinComplete);
    expect(opCount(world, 'OP-003')).toBe(2);
    expect(opCount(world, 'OP-001')).toBe(2);
    expect(world.creations).toHaveLength(1);
    expect(world.passengers.size).toBe(1);
  });

  test('lost response and failed resend stay on F02 with selections; the retry reuses the same ID', async () => {
    const { world } = await bootBoarding();
    world.addFault('OP-003', { kind: 'lose-response' }, { kind: 'network' });
    await agreeBoth();
    await userEvent.click(boardButton());

    expect(await screen.findByText(copy['CPY-F02-012'])).toBeInTheDocument();
    expect(terms()).toBeChecked();
    expect(privacy()).toBeChecked();

    await userEvent.click(boardButton());
    await findTitle(copy['CPY-F03-001']);
    expect(world.creations).toHaveLength(1);
    expect(world.passengers.size).toBe(1);
  });

  test('offline failure keeps both consents and shows the offline message near the action', async () => {
    const { world, platform } = await bootBoarding();
    world.addFault('OP-003', { kind: 'network' }, { kind: 'network' });
    platform.setOffline(true);
    await agreeBoth();
    await userEvent.click(boardButton());

    expect(await screen.findByText(copy['CPY-F02-013'])).toBeInTheDocument();
    expect(terms()).toBeChecked();
    expect(privacy()).toBeChecked();
    expect(world.passengers.size).toBe(0);
  });

  test('policy documents open outside the app without touching consent; open failure is reported', async () => {
    const { platform } = await bootBoarding();
    await userEvent.click(terms());
    const openTerms = screen.getByRole('button', { name: copy['CPY-F02-007'] });
    await userEvent.click(openTerms);

    expect(platform.openedPolicies).toEqual(['https://arca.mock.invalid/policies/terms']);
    expect(terms()).toBeChecked();
    expect(privacy()).not.toBeChecked();
    expect(openTerms).toHaveFocus();

    expect(openTerms).toHaveTextContent(copy['CPY-F02-017']);
    platform.setExternalFails(true);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F02-008'] }));
    expect(await screen.findByText(copy['CPY-F02-014'])).toBeInTheDocument();
    expect(privacy()).not.toBeChecked();
  });
});

describe('cold start after a lost creation response (06 §9.1 #4, step-4 carry-over)', () => {
  async function closedAfterLostCreation() {
    const storage = createFakeStorage();
    const world = createMockWorld('server.prePassenger');
    const first = await bootBoarding({ world, storage });
    world.addFault('OP-003', { kind: 'lose-response' }, { kind: 'network' });
    await agreeBoth();
    await userEvent.click(boardButton());
    await screen.findByText(copy['CPY-F02-012']);
    first.view.unmount();
    return { storage, world };
  }

  test('server already ACTIVE: the same ID replays its receipt and F03 continues (one passenger)', async () => {
    const { storage, world } = await closedAfterLostCreation();
    const before = opCount(world, 'OP-003');
    const booted = bootApp(server, { world, storage });
    await act(() => booted.started);
    await findTitle(copy['CPY-F03-001']);
    expect(booted.router.state.location.pathname).toBe(paths.joinComplete);
    expect(opCount(world, 'OP-003')).toBe(before + 1);
    expect(world.creations).toHaveLength(1);
    expect(world.passengers.size).toBe(1);
  });

  test('no receipt for that ID (replay fails): normal ACTIVE start on F10, never a creation success', async () => {
    const { storage, world } = await closedAfterLostCreation();
    world.addFault('OP-003', { kind: 'network' });
    const booted = bootApp(server, { world, storage });
    await act(() => booted.started);
    await findTitle(copy['CPY-F10-001']);
    expect(booted.router.state.location.pathname).toBe(paths.today);
    expect(world.creations).toHaveLength(1);
  });
});
