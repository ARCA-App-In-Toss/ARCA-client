import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { createFakeStorage, type FakeStorage } from '../../mocks/platform.ts';
import { createMockWorld, type MockWorld, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { bootApp, findTitle, opCount } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

const generationKeys = (storage: FakeStorage) => [...storage.data.keys()].filter((k) => k.includes(':g:'));
const hasText = (storage: FakeStorage, text: string) => [...storage.data.values()].some((v) => v.includes(text));

/** Boots at F10, keeps a draft in the generation area, and opens F31 through F30. */
async function openDeleteAll(world = createMockWorld('server.activeUnanswered'), storage = createFakeStorage()) {
  world.seedAnswer(SYNTHETIC_KEYS.registered, '지워질 합성 답변', {
    dailySemaId: 'd-old',
    createdDateKst: '2026-09-01',
  });
  const booted = bootApp(server, { world, storage });
  await act(() => booted.started);
  await findTitle(copy['CPY-F10-001']);
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
  const textarea = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
  fireEvent.change(textarea, { target: { value: '기기에 남은 합성 임시본' } });
  await waitFor(() => expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(true), { timeout: 3_000 });
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-COM-005'] }));
  await findTitle(copy['CPY-F10-001']);
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-002'] }));
  await findTitle(copy['CPY-F30-001']);
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-F30-034'] }));
  await findTitle(copy['CPY-F31-001']);
  return { ...booted, storage, world };
}

async function confirmDelete() {
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-F31-010'] }));
  const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F31-011'] });
  expect(within(dialog).getByRole('button', { name: copy['CPY-F31-013'] })).toHaveFocus();
  await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F31-014'] }));
  return dialog;
}

describe('F31 all-data delete (03 §7.2, 04 §6.14, 06 §9.3–9.4)', () => {
  test('first step lists scope, retained evidence and backups; cancel returns to F30 without any request', async () => {
    const { world } = await openDeleteAll();
    for (const id of ['CPY-F31-020', 'CPY-F31-021', 'CPY-F31-022', 'CPY-F31-024', 'CPY-F31-025'] as const) {
      expect(screen.getByText(copy[id]).tagName).toBe('LI');
    }
    expect(screen.getByText(copy['CPY-F31-007'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F31-010'] }));
    const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F31-011'] });
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F31-013'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('button', { name: copy['CPY-F31-010'] })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F31-009'] }));
    await findTitle(copy['CPY-F30-001']);
    expect(opCount(world, 'OP-013')).toBe(0);
  });

  test('success: nothing local goes before SUCCEEDED; then the old area is wiped, receipt kept, ack sent, F01 once', async () => {
    const { world, storage, router } = await openDeleteAll();
    let release!: () => void;
    world.addFault('OP-007', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    const dialog = await confirmDelete();
    await waitFor(() => expect(opCount(world, 'OP-007')).toBe(1));
    // Running: locked, and the device data is all still there (commit 전 로컬 유지).
    expect(within(dialog).getByRole('button', { name: copy['CPY-F31-013'] })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(within(dialog).getByText(copy['CPY-F31-015'])).toBeInTheDocument();
    expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(true);
    release();

    await findTitle(copy['CPY-F01-001']);
    expect(router.state.location.pathname).toBe(paths.intro);
    expect(world.passengers.has(SYNTHETIC_KEYS.registered)).toBe(false);
    expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(false);
    expect(generationKeys(storage)).toEqual([]);
    expect(storage.clearCount).toBe(1);
    const deletion = [...world.deletions.values()][0];
    expect(deletion?.acknowledged).toBe(true);
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === copy['CPY-F31-019'])).toBe(true),
    );
    // Old entries cannot bring deleted screens back.
    await act(() => router.navigate(-1));
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.intro));
    expect(screen.queryByText('지워질 합성 답변')).toBeNull();
  });

  test('after success the lock ends: boarding again in the same visit and the first save runs (new generation)', async () => {
    const { world } = await openDeleteAll();
    await confirmDelete();
    await findTitle(copy['CPY-F01-001']);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F01-006'] }));
    await findTitle(copy['CPY-F02-001']);
    await userEvent.click(screen.getByRole('checkbox', { name: copy['CPY-F02-015'] }));
    await userEvent.click(screen.getByRole('checkbox', { name: copy['CPY-F02-016'] }));
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F02-010'] }));
    await findTitle(copy['CPY-F03-001']);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F03-013'] }));
    await findTitle(copy['CPY-F10-001']);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
    const textarea = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
    fireEvent.change(textarea, { target: { value: '새 탑승 첫 합성 답변' } });
    const executes = opCount(world, 'OP-007');
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await screen.findByRole('heading', { level: 2, name: copy['CPY-F12-004'] });
    expect(opCount(world, 'OP-007')).toBe(executes + 1);
    expect(world.answersOf(SYNTHETIC_KEYS.registered).map((a) => a.content)).toEqual(['새 탑승 첫 합성 답변']);
  });

  test('MS-ALLDEL-001: commit failure rolls back; server and device data stay; F31 keeps the retry', async () => {
    const { world, storage } = await openDeleteAll();
    world.deletionCommitFails = true;
    await confirmDelete();
    expect(await screen.findByText(copy['CPY-F31-016'])).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(world.passengers.has(SYNTHETIC_KEYS.registered)).toBe(true);
    expect(world.answersOf(SYNTHETIC_KEYS.registered)).toHaveLength(1);
    expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(true);
    expect(storage.clearCount).toBe(0);
    expect(world.deletionFence(SYNTHETIC_KEYS.registered)).toBeUndefined();
    // The normal session is back: leaving to F30 and using the app works again.
    expect(screen.getByRole('button', { name: copy['CPY-F31-018'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F31-009'] }));
    await findTitle(copy['CPY-F30-001']);
  });

  test('MS-ALLDEL-002: response lost and app closed; restart restores SUCCEEDED in the gate, no re-delete or ACTIVE query', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const storage = createFakeStorage();
    const first = await openDeleteAll(world, storage);
    world.asyncExecution = true;
    world.addFault('OP-007', { kind: 'lose-response' });
    await confirmDelete();
    await waitFor(() => expect(opCount(world, 'OP-007')).toBe(1));
    first.view.unmount();
    world.completeExecuting();
    expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(true);

    const before = {
      prepare: opCount(world, 'OP-013'),
      execute: opCount(world, 'OP-007'),
      today: opCount(world, 'OP-005'),
    };
    const second = bootApp(server, { world, storage });
    await act(() => second.started);
    await findTitle(copy['CPY-F01-001']);
    expect(opCount(world, 'OP-013')).toBe(before.prepare);
    expect(opCount(world, 'OP-007')).toBe(before.execute);
    expect(opCount(world, 'OP-005')).toBe(before.today);
    expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(false);
  });

  test('MS-ALLDEL-003: a failed device removal keeps the gate (no F01); retry finishes; a lost ack still reaches F01', async () => {
    const { world, storage } = await openDeleteAll();
    storage.failNextRemovals(1);
    world.addFault('OP-009', { kind: 'lose-response' });
    await confirmDelete();
    expect(await screen.findByText(copy['CPY-F31-016'])).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: copy['CPY-F01-001'] })).toBeNull();
    expect(screen.queryByRole('button', { name: copy['CPY-F31-009'] })).toBeNull();
    expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F31-018'] }));
    await findTitle(copy['CPY-F01-001']);
    expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(false);
  });

  test('unconfirmed prepare: check later closes the dialog and keeps tracking; recheck finds the reservation; an explicit close ends it', async () => {
    const { world } = await openDeleteAll();
    world.addFault('OP-013', { kind: 'lose-response' }, { kind: 'lose-response' });
    const dialog = await confirmDelete();
    await within(dialog).findByText(copy['CPY-F31-027']);
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F31-028'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText(copy['CPY-F31-027'])).toBeInTheDocument();
    expect(world.deletionFence(SYNTHETIC_KEYS.registered)?.state).toBe('PREPARED');

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F31-029'] }));
    const again = await screen.findByRole('alertdialog', { name: copy['CPY-F31-011'] });
    await userEvent.click(within(again).getByRole('button', { name: copy['CPY-COM-007'] }));
    // Same key → the same reserved ticket; nothing runs without the user.
    await screen.findByRole('button', { name: copy['CPY-COM-026'] });
    expect(world.deletions.size).toBe(1);
    expect(opCount(world, 'OP-007')).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-COM-026'] }));
    expect(await screen.findByText(copy['CPY-COM-027'])).toBeInTheDocument();
    expect(world.deletionFence(SYNTHETIC_KEYS.registered)).toBeUndefined();
    expect(world.passengers.has(SYNTHETIC_KEYS.registered)).toBe(true);
  });

  test('offline before reaching the server: says nothing started; data untouched', async () => {
    const { world, platform } = await openDeleteAll();
    platform.setOffline(true);
    world.addFault('OP-013', { kind: 'network' });
    await confirmDelete();
    expect(await screen.findByText(copy['CPY-F31-017'])).toBeInTheDocument();
    expect(world.deletions.size).toBe(0);
  });

  test('MS-ALLDEL-005: a kept unknown save blocks the prepare; a server-side pending command refuses it', async () => {
    const { world, storage } = await openDeleteAll();
    const tracker = [...storage.data.keys()].length;
    // Server says another command is executing: no deletion is prepared (05 OP-013).
    world.asyncExecution = true;
    world.tickets.set('synthetic-running', {
      owner: SYNTHETIC_KEYS.registered,
      ticketId: 'synthetic-running',
      operationId: 'op-running',
      fingerprint: 'x',
      dailySemaId: 'd-x',
      question: world.sema.primaryQuestion,
      state: 'EXECUTING',
      contentDigest: null,
      pendingContent: null,
      answerId: null,
      error: null,
      completedAt: null,
      acknowledged: false,
    });
    await confirmDelete();
    expect(await screen.findByText(copy['CPY-F31-030'])).toBeInTheDocument();
    expect(world.deletions.size).toBe(0);
    expect([...storage.data.keys()].length).toBeGreaterThanOrEqual(tracker - 2);
  });
});

describe('restart with a reserved deletion (MS-ALLDEL-005, IX-041)', () => {
  test('a PREPARED request opens F31 first, is never run on its own, and runs only after a new confirmation', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const storage = createFakeStorage();
    const first = await openDeleteAll(world, storage);
    // Execution never reached the server: the ticket stays PREPARED behind the fence.
    world.addFault('OP-007', { kind: 'network' });
    await confirmDelete();
    await screen.findByRole('button', { name: copy['CPY-COM-026'] });
    first.view.unmount();

    const executes = opCount(world, 'OP-007');
    // Opened on a plain route: the kept request still comes first (06 §5.3 #5).
    const second = bootApp(server, { world, storage, initialPath: paths.today });
    await act(() => second.started);
    await findTitle(copy['CPY-F31-001']);
    await screen.findByRole('button', { name: copy['CPY-COM-026'] });
    expect(opCount(world, 'OP-007')).toBe(executes);
    expect(world.passengers.has(SYNTHETIC_KEYS.registered)).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F31-010'] }));
    const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F31-011'] });
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F31-014'] }));
    await findTitle(copy['CPY-F01-001']);
    expect(world.deletions.size).toBe(1);
    expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(false);
  });
});

describe('recentDeletion and a new boarding (MS-ALLDEL-004)', () => {
  function deletedElsewhere(world: MockWorld, newGeneration: string | null) {
    world.deletions.set('synthetic-deletion-x', {
      owner: SYNTHETIC_KEYS.registered,
      ticketId: 'synthetic-deletion-x',
      operationId: 'op-x',
      generation: 'gen-synthetic-1',
      state: 'SUCCEEDED',
      error: null,
      acknowledged: true,
    });
    world.passengers.delete(SYNTHETIC_KEYS.registered);
    for (const answer of [...world.answers.values()]) world.answers.delete(answer.answerId);
    if (newGeneration) {
      world.passengers.set(SYNTHETIC_KEYS.registered, {
        passengerCode: 'SYN-0002',
        nickname: null,
        revision: 'p-r1',
        dataGeneration: newGeneration,
      });
    }
  }

  test('another device deleted: this device removes only the old area; a later new-generation draft is never touched', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const storage = createFakeStorage();
    const first = await openDeleteAll(world, storage);
    first.view.unmount();
    deletedElsewhere(world, 'gen-synthetic-new');

    const second = bootApp(server, { world, storage });
    await act(() => second.started);
    await findTitle(copy['CPY-F10-001']);
    expect(hasText(storage, '기기에 남은 합성 임시본')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
    const textarea = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
    fireEvent.change(textarea, { target: { value: '새 탑승 합성 임시본' } });
    await waitFor(() => expect(hasText(storage, '새 탑승 합성 임시본')).toBe(true), { timeout: 3_000 });
    second.view.unmount();

    // The same old receipt arrives again: the new generation's draft stays.
    const third = bootApp(server, { world, storage });
    await act(() => third.started);
    await findTitle(copy['CPY-F10-001']);
    expect(hasText(storage, '새 탑승 합성 임시본')).toBe(true);
    expect(storage.clearCount).toBe(0);
  });
});
