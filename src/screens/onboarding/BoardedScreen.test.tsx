import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { createFakeStorage } from '../../mocks/platform.ts';
import { createMockWorld, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { bootApp, findTitle, opCount } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function bootBoarded(options: Parameters<typeof bootApp>[1] = {}) {
  const booted = bootApp(server, { base: 'server.prePassenger', initialPath: paths.join, ...options });
  await act(() => booted.started);
  await findTitle(copy['CPY-F02-001']);
  await userEvent.click(screen.getByRole('checkbox', { name: copy['CPY-F02-015'] }));
  await userEvent.click(screen.getByRole('checkbox', { name: copy['CPY-F02-016'] }));
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-F02-010'] }));
  await findTitle(copy['CPY-F03-001']);
  return booted;
}

const field = () => screen.getByRole('textbox', { name: copy['CPY-F03-018'] });
const primary = () => screen.getByRole('button', { name: copy['CPY-F03-013'] });
const skip = () => screen.queryByRole('button', { name: copy['CPY-F03-019'] });
const type = (value: string) => fireEvent.change(field(), { target: { value } });
const nickname = (world: ReturnType<typeof bootApp>['world']) =>
  world.passengers.get(SYNTHETIC_KEYS.registered)?.nickname ?? null;

describe('F03 nickname (IX-003, IX-035, MS-NICK-001/002)', () => {
  test('nickname count updates during IME without premature validation or submission', async () => {
    const { world } = await bootBoarded();
    const input = field();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: ' 가나 ' } });
    expect(document.getElementById('f03-count')).toHaveTextContent('2/12자');
    fireEvent.change(input, { target: { value: '가나👩‍👩‍👧' } });
    expect(document.getElementById('f03-count')).toHaveTextContent('3/12자');
    fireEvent.change(input, { target: { value: '가'.repeat(13) } });
    expect(document.getElementById('f03-count')).toHaveTextContent('13/12자');
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(primary());
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(opCount(world, 'OP-004')).toBe(0);
    fireEvent.compositionEnd(input, { target: { value: '가'.repeat(13) } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  test('empty value proceeds to F10 with no OP-004 (API-V-004)', async () => {
    const { world, router } = await bootBoarded();
    type('   ');
    await userEvent.click(primary());
    expect(await findTitle(copy['CPY-F10-001'])).toHaveFocus();
    expect(router.state.location.pathname).toBe(paths.today);
    expect(opCount(world, 'OP-004')).toBe(0);
  });

  test('valid value is saved trimmed, then F10', async () => {
    const { world } = await bootBoarded();
    type('  항해자 ');
    expect(screen.getByText('3/12자')).toBeInTheDocument();
    await userEvent.click(primary());
    await findTitle(copy['CPY-F10-001']);
    expect(opCount(world, 'OP-004')).toBe(1);
    expect(nickname(world)).toBe('항해자');
  });

  test('Enter outside composition runs the Primary; Enter while composing does nothing', async () => {
    const { world } = await bootBoarded();
    fireEvent.compositionStart(field());
    fireEvent.change(field(), { target: { value: '항' } });
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });
    expect(opCount(world, 'OP-004')).toBe(0);
    fireEvent.compositionEnd(field(), { target: { value: '항해' } });
    type('항해');
    fireEvent.keyDown(field(), { key: 'Enter' });
    await findTitle(copy['CPY-F10-001']);
    expect(nickname(world)).toBe('항해');
  });

  test('one character: no error while typing, error on attempt, no request, input kept', async () => {
    const { world } = await bootBoarded();
    type('가');
    expect(screen.queryByText(copy['CPY-F03-010'])).toBeNull();
    await userEvent.click(primary());
    expect(screen.getByText(copy['CPY-F03-010'], { selector: '.arca-field-error' })).toBeInTheDocument();
    expect(field()).toHaveValue('가');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(opCount(world, 'OP-004')).toBe(0);
    expect(skip()).toBeNull();
  });

  test('13 EGC and forbidden characters show at once and block the Primary', async () => {
    const { world } = await bootBoarded();
    type('가나다라마바사아자차카타파');
    expect(screen.getByText(copy['CPY-F03-011'])).toBeInTheDocument();
    expect(primary()).toHaveAttribute('aria-disabled', 'true');
    type('가​나');
    expect(screen.getByText(copy['CPY-F03-012'])).toBeInTheDocument();
    await userEvent.click(primary());
    expect(opCount(world, 'OP-004')).toBe(0);
  });

  test('definite failure keeps the input and offers an explicit skip that sends nothing more', async () => {
    const { world } = await bootBoarded();
    world.addFault('OP-004', {
      kind: 'error',
      status: 422,
      body: { error: { code: 'NICKNAME_INVALID', category: 'VALIDATION', requestId: 'synthetic-req' } },
    });
    type('항해자');
    await userEvent.click(primary());
    expect(await screen.findByText(copy['CPY-F03-015'])).toBeInTheDocument();
    expect(field()).toHaveValue('항해자');
    const requests = opCount(world, 'OP-004');

    await userEvent.click(skip() as HTMLElement);
    await findTitle(copy['CPY-F10-001']);
    expect(opCount(world, 'OP-004')).toBe(requests);
    expect(nickname(world)).toBeNull();
  });

  test('offline before reaching the server shows the offline copy and the skip action', async () => {
    const { world, platform } = await bootBoarded();
    world.addFault('OP-004', { kind: 'network' });
    platform.setOffline(true);
    type('항해자');
    await userEvent.click(primary());
    expect(await screen.findByText(copy['CPY-F03-017'])).toBeInTheDocument();
    expect(skip()).not.toBeNull();
  });

  test('MS-NICK-002 lost response is restored by the same key: one receipt, then F10', async () => {
    const { world } = await bootBoarded();
    world.addFault('OP-004', { kind: 'lose-response' });
    type('항해자');
    await userEvent.click(primary());
    await findTitle(copy['CPY-F10-001']);
    expect(opCount(world, 'OP-004')).toBe(2);
    expect(world.nicknameReceipts).toHaveLength(1);
  });

  test('unconfirmed outcome is not a failure: no skip, and the retry reuses the same key', async () => {
    const { world } = await bootBoarded();
    world.faults.set('OP-004', [{ kind: 'lose-response' }, { kind: 'lose-response' }]);
    type('항해자');
    await userEvent.click(primary());
    expect(await screen.findByText(copy['CPY-F11-044'])).toBeInTheDocument();
    expect(screen.queryByText(copy['CPY-F03-015'])).toBeNull();
    expect(skip()).toBeNull();
    expect(world.nicknameReceipts).toHaveLength(1);

    await userEvent.click(primary());
    await findTitle(copy['CPY-F10-001']);
    expect(world.nicknameReceipts).toHaveLength(1);
    expect(opCount(world, 'OP-004')).toBe(3);
  });

  test('MS-NICK-002 device B changes the nickname between resends: the replayed receipt does not overwrite it', async () => {
    const { world } = await bootBoarded();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    world.faults.set('OP-004', [{ kind: 'lose-response' }, { kind: 'hold', release: held }]);
    type('항해자');
    await userEvent.click(primary());
    await vi.waitFor(() => expect(opCount(world, 'OP-004')).toBe(2));
    const passenger = world.passengers.get(SYNTHETIC_KEYS.registered);
    if (passenger) Object.assign(passenger, { nickname: '기기B', revision: 'p-rB' });
    release();

    await findTitle(copy['CPY-F10-001']);
    expect(nickname(world)).toBe('기기B');
    expect(world.nicknameReceipts).toHaveLength(1);
  });

  test('expired key: no success/failure guess, current profile shown, next save uses a new key', async () => {
    const { world } = await bootBoarded();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    world.faults.set('OP-004', [{ kind: 'lose-response' }, { kind: 'hold', release: held }]);
    type('항해자');
    await userEvent.click(primary());
    await vi.waitFor(() => expect(opCount(world, 'OP-004')).toBe(2));
    const [receipt] = world.nicknameReceipts;
    if (receipt) receipt.expired = true;
    release();

    expect(await screen.findByText(copy['CPY-F11-044'])).toBeInTheDocument();
    expect(screen.queryByText(copy['CPY-F03-015'])).toBeNull();
    expect(skip()).toBeNull();
    await vi.waitFor(() => expect(field()).toHaveValue('항해자'));

    type('새 이름');
    await userEvent.click(primary());
    await findTitle(copy['CPY-F10-001']);
    expect(nickname(world)).toBe('새 이름');
    expect(world.nicknameReceipts).toHaveLength(2);
  });

  test('Back and other route changes are locked while the nickname is being saved', async () => {
    const { world, router } = await bootBoarded();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    world.faults.set('OP-004', [{ kind: 'hold', release: held }]);
    type('항해자');
    await userEvent.click(primary());
    await vi.waitFor(() => expect(opCount(world, 'OP-004')).toBe(1));
    await act(() => router.navigate(paths.archive));
    expect(router.state.location.pathname).toBe(paths.joinComplete);
    expect(field()).toHaveAttribute('readonly');

    release();
    await findTitle(copy['CPY-F10-001']);
  });
});

describe('nickname request left unresolved after F03 (step-4 carry-over)', () => {
  test('next start restores the receipt with the same key and removes the tracker; no second change', async () => {
    const storage = createFakeStorage();
    const world = createMockWorld('server.prePassenger');
    const first = await bootBoarded({ world, storage });
    world.faults.set('OP-004', [{ kind: 'lose-response' }, { kind: 'lose-response' }]);
    type('항해자');
    await userEvent.click(primary());
    await screen.findByText(copy['CPY-F11-044']);
    const tracked = () => [...storage.data.values()].some((v) => v.includes('"expectedRevision"'));
    expect(tracked()).toBe(true);
    first.view.unmount();

    const booted = bootApp(server, { world, storage });
    await act(() => booted.started);
    await findTitle(copy['CPY-F10-001']);
    await vi.waitFor(() => expect(tracked()).toBe(false));
    expect(opCount(world, 'OP-004')).toBe(3);
    expect(world.nicknameReceipts).toHaveLength(1);
    expect(nickname(world)).toBe('항해자');
  });
});
