import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { createFakeStorage } from '../../mocks/platform.ts';
import { createMockWorld, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { bootApp, findTitle, opCount } from '../../test/boot.tsx';
import { copy, rootTabLabels } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

const passengerGroup = () => screen.getByRole('region', { name: copy['CPY-F30-002'] });
const displayName = () =>
  within(passengerGroup()).getByText(copy['CPY-F30-003']).parentElement?.querySelector('dd')?.textContent;

async function openSettings(options: { nickname?: string | null; from?: 'today' | 'archive' } = {}) {
  const world = createMockWorld('server.activeUnanswered');
  const passenger = world.passengers.get(SYNTHETIC_KEYS.registered);
  if (passenger && options.nickname !== undefined) passenger.nickname = options.nickname;
  const storage = createFakeStorage();
  const booted = bootApp(server, { world, storage });
  await act(() => booted.started);
  await findTitle(copy['CPY-F10-001']);
  if (options.from === 'archive') {
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
    await findTitle(copy['CPY-F20-001']);
  }
  await userEvent.click(screen.getByRole('button', { name: rootTabLabels.settings }));
  await findTitle(copy['CPY-F30-001']);
  await waitFor(() => expect(displayName()).toBeTruthy());
  return { ...booted, storage };
}

describe('F30 settings (03 §7.1, 04 §6.13)', () => {
  test('nickname count updates during IME without premature validation or submission', async () => {
    const { world } = await openSettings({ nickname: null });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-007'] }));
    const input = screen.getByRole('textbox', { name: copy['CPY-F30-008'] });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: ' 가나 ' } });
    expect(document.getElementById('f30-count')).toHaveTextContent('2/12자');
    fireEvent.change(input, { target: { value: '가나👩‍👩‍👧' } });
    expect(document.getElementById('f30-count')).toHaveTextContent('3/12자');
    fireEvent.change(input, { target: { value: '가'.repeat(13) } });
    expect(document.getElementById('f30-count')).toHaveTextContent('13/12자');
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(screen.getByRole('button', { name: copy['CPY-F30-015'] }));
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(opCount(world, 'OP-004')).toBe(0);
    fireEvent.compositionEnd(input, { target: { value: '가'.repeat(13) } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  test('read: nickname or passenger code as the name, the code; settings is the current root tab without Back', async () => {
    const { router } = await openSettings({ nickname: '합성 승객', from: 'archive' });
    expect(router.state.location.pathname).toBe(paths.settings);
    expect(displayName()).toBe('합성 승객');
    expect(within(passengerGroup()).getByText('ARC-2417')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: rootTabLabels.settings })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: copy['CPY-COM-005'] })).toBeNull();
    expect(document.body.textContent).not.toContain(SYNTHETIC_KEYS.registered);
    expect(screen.getByRole('button', { name: copy['CPY-F30-034'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
    await findTitle(copy['CPY-F20-001']);
  });

  test('IX-004: edit starts from the current value; unchanged disables save; a new value saves once and closes to the trigger', async () => {
    const { world, storage } = await openSettings({ nickname: '합성 승객' });
    const trigger = screen.getByRole('button', { name: copy['CPY-F30-007'] });
    await userEvent.click(trigger);
    const field = screen.getByRole('textbox', { name: copy['CPY-F30-008'] });
    expect(field).toHaveValue('합성 승객');
    expect(field).toHaveFocus();
    expect(screen.queryByRole('button', { name: rootTabLabels.today })).toBeNull();
    const save = screen.getByRole('button', { name: copy['CPY-F30-015'] });
    expect(save).toBeDisabled();
    fireEvent.change(field, { target: { value: '  합성 승객 ' } });
    expect(save).toBeDisabled();
    expect(screen.getByText(copy['CPY-F30-017'])).toBeInTheDocument();

    fireEvent.change(field, { target: { value: '새 합성 이름' } });
    await userEvent.click(save);
    await screen.findByText(copy['CPY-F30-019']);
    expect(displayName()).toBe('새 합성 이름');
    expect(screen.queryByRole('textbox', { name: copy['CPY-F30-008'] })).toBeNull();
    expect(screen.getByRole('button', { name: copy['CPY-F30-007'] })).toHaveFocus();
    expect(screen.getByRole('button', { name: rootTabLabels.today })).toBeInTheDocument();
    expect(opCount(world, 'OP-004')).toBe(1);
    expect(world.passengers.get(SYNTHETIC_KEYS.registered)?.nickname).toBe('새 합성 이름');
    expect([...storage.data.values()].some((v) => v.includes('새 합성 이름'))).toBe(false);
  });

  test('empty save clears the nickname with null; the passenger code becomes the name', async () => {
    const { world } = await openSettings({ nickname: '합성 승객' });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-007'] }));
    fireEvent.change(screen.getByRole('textbox', { name: copy['CPY-F30-008'] }), { target: { value: '   ' } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-015'] }));
    await screen.findByText(copy['CPY-F30-019']);
    expect(world.passengers.get(SYNTHETIC_KEYS.registered)?.nickname).toBeNull();
    expect(world.nicknameReceipts.at(-1)?.fingerprint).toContain('[null,');
    expect(displayName()).toBe('ARC-2417');
  });

  test('cancel discards the edit at once, sends nothing, and returns focus to the trigger', async () => {
    const { world } = await openSettings({ nickname: null });
    expect(displayName()).toBe('ARC-2417');
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-007'] }));
    const field = screen.getByRole('textbox', { name: copy['CPY-F30-008'] });
    expect(field).toHaveValue('');
    fireEvent.change(field, { target: { value: '버릴 합성' } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-016'] }));
    expect(screen.queryByRole('textbox', { name: copy['CPY-F30-008'] })).toBeNull();
    expect(screen.getByRole('button', { name: copy['CPY-F30-007'] })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-007'] }));
    expect(screen.getByRole('textbox', { name: copy['CPY-F30-008'] })).toHaveValue('');
    expect(opCount(world, 'OP-004')).toBe(0);
  });

  test('validation and a definite failure keep the input; offline-unsent says so; a lost response restores the same receipt', async () => {
    const { world, platform } = await openSettings({ nickname: null });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-007'] }));
    const field = screen.getByRole('textbox', { name: copy['CPY-F30-008'] });
    fireEvent.change(field, { target: { value: '한' } });
    fireEvent.blur(field);
    expect(screen.getByText(copy['CPY-F30-012'])).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(field, { target: { value: '합성 이름' } });
    platform.setOffline(true);
    world.addFault('OP-004', { kind: 'network' });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-015'] }));
    await screen.findByText(copy['CPY-F30-021']);
    expect(field).toHaveValue('합성 이름');

    platform.setOffline(false);
    world.addFault('OP-004', { kind: 'lose-response' });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-022'] }));
    await screen.findByText(copy['CPY-F30-019']);
    expect(world.nicknameReceipts).toHaveLength(1);
    expect(displayName()).toBe('합성 이름');
  });

  test('IX-018: policies and support open outside; F30 keeps the edit and the trigger focus; failure is shown', async () => {
    const { platform } = await openSettings({ nickname: null });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-007'] }));
    fireEvent.change(screen.getByRole('textbox', { name: copy['CPY-F30-008'] }), { target: { value: '작성 중 합성' } });
    const terms = screen.getByRole('button', { name: copy['CPY-F30-026'] });
    await userEvent.click(terms);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-027'] }));
    expect(platform.openedPolicies).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: copy['CPY-F30-008'] })).toHaveValue('작성 중 합성');
    expect(screen.getByRole('button', { name: copy['CPY-F30-027'] })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-028'] }));
    expect(await screen.findByText(copy['CPY-F30-029'])).toBeInTheDocument();
  });
});
