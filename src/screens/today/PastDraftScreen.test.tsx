import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { msUntilKstBoundary } from '../../domain/time/kst.ts';
import { createFakeStorage } from '../../mocks/platform.ts';
import {
  createMockWorld,
  SYNTHETIC_NEXT_DAY_SEMA,
  SYNTHETIC_REPLACED_SEMA,
  SYNTHETIC_SEMA,
} from '../../mocks/world.ts';
import { bootApp, findTitle } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const DAY_MS = 24 * 60 * 60 * 1_000;
const status = () => screen.getAllByRole('status').map((s) => s.textContent ?? '');

async function openWrite(options: Parameters<typeof bootApp>[1] = {}) {
  const booted = bootApp(server, options);
  await act(() => booted.started);
  await findTitle(copy['CPY-F10-001']);
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
  await findTitle(copy['CPY-F11-001']);
  const textarea = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
  return { ...booted, textarea };
}

async function typeKept(textarea: HTMLElement, text: string) {
  fireEvent.change(textarea, { target: { value: text } });
  await waitFor(() => expect(document.getElementById('f11-help')?.textContent).toContain(copy['CPY-F11-011']), {
    timeout: 3_000,
  });
}

describe('MS-TIME-002 F11 → F13 when the server day changed (IX-034, DATE_CHANGED)', () => {
  test('text, question, date and real expiry move to F13; copy first; nothing saved for the past day', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const now = Date.parse('2026-09-27T05:00:00Z');
    const { textarea, platform, router } = await openWrite({ world, now: () => now });
    await typeKept(textarea, '  지난 날 합성 글\n원문 그대로  ');

    world.sema = SYNTHETIC_NEXT_DAY_SEMA;
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));

    await findTitle(copy['CPY-F13-001']);
    await screen.findByRole('textbox', { name: copy['CPY-F13-007'] });
    expect(router.state.location.pathname).toBe(paths.pastDraft);
    expect(screen.getByText(copy['CPY-F13-003'])).toBeInTheDocument();
    expect(screen.getByText('2026년 9월 27일')).toBeInTheDocument();
    expect(screen.getByText(SYNTHETIC_SEMA.primaryQuestion.text)).toBeInTheDocument();
    const text = screen.getByRole('textbox', { name: copy['CPY-F13-007'] });
    expect(text).toHaveValue('  지난 날 합성 글\n원문 그대로  ');
    expect(text).toHaveAttribute('readonly');
    expect(document.getElementById('f13-keep')?.textContent).toContain('2026년 10월 4일 오후 2:00 (KST)');
    expect(world.tickets.size).toBe(0);
    expect(world.answers.size).toBe(0);

    const [first, second] = within(screen.getByText(copy['CPY-F13-012']).closest('.arca-actions') as HTMLElement)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect([first, second]).toEqual([copy['CPY-F13-012'], copy['CPY-F13-016']]);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F13-012'] }));
    expect(platform.clipboardWrites).toEqual(['  지난 날 합성 글\n원문 그대로  ']);
    expect(status()).toContain(copy['CPY-F13-014']);
    expect(JSON.stringify(router.state.location)).not.toContain('지난 날');
    expect(JSON.stringify(router.state.location)).not.toContain('synthetic-day');
  });

  test('MS-PLATFORM-001 copy failure: direct selection guidance and focus on the read-only text (IX-040)', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const { textarea, platform } = await openWrite({ world });
    await typeKept(textarea, '복사 실패 합성');
    world.sema = SYNTHETIC_NEXT_DAY_SEMA;
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await findTitle(copy['CPY-F13-001']);
    await screen.findByRole('textbox', { name: copy['CPY-F13-007'] });

    platform.setClipboardFails(true);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F13-012'] }));
    expect(status()).toContain(copy['CPY-F13-015']);
    expect(screen.getByRole('textbox', { name: copy['CPY-F13-007'] })).toHaveFocus();
    expect(screen.getByRole('button', { name: copy['CPY-F13-013'] })).toBeInTheDocument();
  });

  test('today action goes to F10 with the new day; the past text is not put into today', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const { textarea, services } = await openWrite({ world });
    await typeKept(textarea, '옮기지 않을 합성');
    world.sema = SYNTHETIC_NEXT_DAY_SEMA;
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await findTitle(copy['CPY-F13-001']);
    await screen.findByRole('textbox', { name: copy['CPY-F13-007'] });

    await act(() => services.queryClient.invalidateQueries());
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F13-016'] }));
    await findTitle(copy['CPY-F10-001']);
    expect(await screen.findByText(SYNTHETIC_NEXT_DAY_SEMA.primaryQuestion.text)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
    expect(await screen.findByRole('textbox', { name: copy['CPY-F11-003'] })).toHaveValue('');
  });
});

describe('F10 past drafts Sheet → F13 review (IX-015, IX-034)', () => {
  async function withPastDraft(ageMs: number) {
    const storage = createFakeStorage();
    const world = createMockWorld('server.activeUnanswered');
    const start = Date.parse('2026-09-27T05:00:00Z');
    const first = await openWrite({ world, storage, now: () => start });
    await typeKept(first.textarea, '지난 임시본 합성');
    first.view.unmount();
    world.sema = SYNTHETIC_NEXT_DAY_SEMA;
    const booted = bootApp(server, { world, storage, now: () => start + ageMs });
    await act(() => booted.started);
    await findTitle(copy['CPY-F10-001']);
    return { ...booted, storage };
  }

  test('area → Sheet row (date, question, expiry) → F13 with today first and copy second', async () => {
    await withPastDraft(DAY_MS);
    await userEvent.click(await screen.findByRole('button', { name: copy['CPY-F10-026'] }));
    const sheet = await screen.findByRole('dialog', { name: copy['CPY-F10-027'] });
    expect(within(sheet).getByText('2026년 9월 27일')).toBeInTheDocument();
    expect(within(sheet).getByText(SYNTHETIC_SEMA.primaryQuestion.text)).toBeInTheDocument();
    expect(within(sheet).getByText('2026년 10월 4일 오후 2:00 (KST)까지 볼 수 있어요.')).toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole('button', { name: /2026년 9월 27일/ }));
    await findTitle(copy['CPY-F13-002']);
    await screen.findByRole('textbox', { name: copy['CPY-F13-007'] });
    expect(screen.getByText(copy['CPY-F13-004'])).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: copy['CPY-F13-007'] })).toHaveValue('지난 임시본 합성');
    const buttons = within(screen.getByText(copy['CPY-F13-016']).closest('.arca-actions') as HTMLElement)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(buttons).toEqual([copy['CPY-F13-016'], copy['CPY-F13-012']]);
  });

  test('Sheet closes only through its close control/Escape and returns focus to the trigger', async () => {
    await withPastDraft(DAY_MS);
    const trigger = await screen.findByRole('button', { name: copy['CPY-F10-026'] });
    await userEvent.click(trigger);
    const sheet = await screen.findByRole('dialog', { name: copy['CPY-F10-027'] });
    await userEvent.click(within(sheet).getByRole('button', { name: copy['CPY-F10-034'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  test('7 days after the last edit the draft is removed and the area is gone', async () => {
    const { storage } = await withPastDraft(7 * DAY_MS);
    await waitFor(() => expect([...storage.data.values()].some((v) => v.includes('"recordType":"draft"'))).toBe(false));
    expect(screen.queryByRole('button', { name: copy['CPY-F10-026'] })).toBeNull();
  });
});

describe('MS-SEMA-001 IX-012 SEMA replaced while writing', () => {
  test('text read-only, copy Primary, new question Secondary; nothing moved into the new question', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const { textarea, platform } = await openWrite({ world });
    await typeKept(textarea, '교체 전 합성 글');
    world.sema = SYNTHETIC_REPLACED_SEMA;
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));

    await waitFor(() => expect(status()).toContain(copy['CPY-F11-033']));
    expect(textarea).toHaveAttribute('readonly');
    expect(textarea).toHaveValue('교체 전 합성 글');
    expect(screen.queryByRole('button', { name: copy['CPY-F11-018'] })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-029'] }));
    expect(platform.clipboardWrites).toEqual(['교체 전 합성 글']);

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-035'] }));
    await findTitle(copy['CPY-F10-001']);
    expect(await screen.findByText(SYNTHETIC_REPLACED_SEMA.primaryQuestion.text)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
    expect(await screen.findByRole('textbox', { name: copy['CPY-F11-003'] })).toHaveValue('');
    expect(world.tickets.size).toBe(0);
  });

  test('an answer saved before the replacement stays complete with its own question snapshot', async () => {
    const world = createMockWorld('server.activeAnswered');
    world.sema = SYNTHETIC_REPLACED_SEMA;
    const booted = bootApp(server, { world });
    await act(() => booted.started);
    await findTitle(copy['CPY-F10-001']);

    const saved = screen.getByRole('region', { name: copy['CPY-F10-015'] });
    expect(saved).toHaveTextContent(SYNTHETIC_SEMA.primaryQuestion.text);
    expect(saved).not.toHaveTextContent(SYNTHETIC_REPLACED_SEMA.primaryQuestion.text);
    expect(screen.queryByRole('button', { name: copy['CPY-F10-005'] })).toBeNull();
    expect(world.answers.size).toBe(1);
  });

  test('a request accepted before the replacement still runs: F12, the accepted question kept', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const { textarea, router } = await openWrite({ world });
    await typeKept(textarea, '교체 직전 수락 합성');
    let release = () => {};
    world.addFault('OP-007', {
      kind: 'hold',
      release: new Promise<void>((resolve) => {
        release = resolve;
      }),
    });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await waitFor(() => expect(world.requests.some((r) => r.op === 'OP-007')).toBe(true));
    world.sema = SYNTHETIC_REPLACED_SEMA;
    release();

    await screen.findByRole('heading', { level: 2, name: copy['CPY-F12-004'] });
    expect(router.state.location.pathname).toBe(paths.saved);
    const [answer] = [...world.answers.values()];
    expect(world.answers.size).toBe(1);
    expect(answer?.content).toBe('교체 직전 수락 합성');
    expect(answer?.question.questionId).toBe(SYNTHETIC_SEMA.primaryQuestion.questionId);
    expect(answer?.dailySemaId).toBe(SYNTHETIC_SEMA.dailySemaId);
  });
});

describe('foreground / KST boundary re-query (06 §6.2, IX-029)', () => {
  test('F11 open over midnight: foreground re-reads OP-005; the new server day moves the text to F13', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const { textarea, platform } = await openWrite({ world });
    await typeKept(textarea, '자정 넘긴 합성 글');
    world.sema = SYNTHETIC_NEXT_DAY_SEMA;
    act(() => {
      platform.setVisible(false);
      platform.setVisible(true);
    });
    await findTitle(copy['CPY-F13-001']);
    expect(await screen.findByRole('textbox', { name: copy['CPY-F13-007'] })).toHaveValue('자정 넘긴 합성 글');
    expect(world.tickets.size).toBe(0);
  });

  test('F10 foreground shows the new day; the first entry used the F00 read model (one OP-005)', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const booted = bootApp(server, { world });
    await act(() => booted.started);
    await findTitle(copy['CPY-F10-001']);
    expect(world.requests.filter((r) => r.op === 'OP-005')).toHaveLength(1);
    world.sema = SYNTHETIC_NEXT_DAY_SEMA;
    act(() => {
      booted.platform.setVisible(false);
      booted.platform.setVisible(true);
    });
    expect(await screen.findByText(SYNTHETIC_NEXT_DAY_SEMA.primaryQuestion.text)).toBeInTheDocument();
  });

  test('the boundary hint fires just after the next KST midnight', () => {
    expect(msUntilKstBoundary(Date.parse('2026-09-27T14:59:00Z'))).toBe(62_000);
    expect(msUntilKstBoundary(Date.parse('2026-09-27T15:00:00Z'))).toBe(DAY_MS + 2_000);
  });
});

describe('MS-TIME-001 / MS-TIME-003 accepted before midnight, settled after', () => {
  test('a save accepted on the old day succeeds after the day changes: F12, not F13; background never fails it', async () => {
    const world = createMockWorld('server.activeUnanswered');
    world.asyncExecution = true;
    const { textarea, platform, router } = await openWrite({ world });
    await typeKept(textarea, '자정 직전 합성 저장');
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await waitFor(() => expect(status()).toContain(copy['CPY-F11-024']));

    act(() => platform.setVisible(false));
    world.completeExecuting();
    world.sema = SYNTHETIC_NEXT_DAY_SEMA;
    act(() => platform.setVisible(true));

    await screen.findByRole('heading', { level: 2, name: copy['CPY-F12-004'] });
    expect(router.state.location.pathname).toBe(paths.saved);
    expect(world.answers.size).toBe(1);
    expect([...world.answers.values()][0]?.dailySemaId).toBe(SYNTHETIC_SEMA.dailySemaId);
  });
});

describe('CMP-018 platform Back', () => {
  test('Back while the Sheet is open closes it and stays on F10', async () => {
    const storage = createFakeStorage();
    const world = createMockWorld('server.activeUnanswered');
    const first = await openWrite({ world, storage });
    await typeKept(first.textarea, 'Back 합성');
    first.view.unmount();
    world.sema = SYNTHETIC_NEXT_DAY_SEMA;
    const booted = bootApp(server, { world, storage });
    await act(() => booted.started);
    await findTitle(copy['CPY-F10-001']);
    await act(() => booted.router.navigate(paths.archive));
    await act(() => booted.router.navigate(paths.today));
    await userEvent.click(await screen.findByRole('button', { name: copy['CPY-F10-026'] }));
    await screen.findByRole('dialog', { name: copy['CPY-F10-027'] });
    await act(() => booted.router.navigate(-1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(booted.router.state.location.pathname).toBe(paths.today);
  });
});
