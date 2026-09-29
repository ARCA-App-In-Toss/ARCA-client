import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { mockErrors } from '../../mocks/handlers.ts';
import { createMockWorld, type MockWorld, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { bootApp, findTitle, opCount } from '../../test/boot.tsx';
import { revealObservedTargets } from '../../test/intersection.ts';
import { copy, fill, rootTabLabels } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function openArchive(world = createMockWorld('server.activeUnanswered')) {
  const booted = bootApp(server, { world });
  await act(() => booted.started);
  await findTitle(copy['CPY-F10-001']);
  await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
  await findTitle(copy['CPY-F20-001']);
  return booted;
}

describe('F20 first page (03 §6.1, 04 §6.9)', () => {
  test('empty: one state panel with its title only; the root tab still leads to today', async () => {
    await openArchive();
    expect(await screen.findByRole('heading', { level: 2, name: copy['CPY-F20-011'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '오늘의 항해 보기' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.today }));
    expect(await findTitle(copy['CPY-F10-001'])).toBeInTheDocument();
  });

  test('newest first, month headings only where the KST year-month changes, date above question, row opens F21', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const longQuestion = { ...world.sema.primaryQuestion, text: `${'질'.repeat(90)}` };
    world.seedAnswer(SYNTHETIC_KEYS.registered, '8월 합성', {
      dailySemaId: 'd-0831',
      createdAt: '2026-08-31T01:00:00Z',
      createdDateKst: '2026-08-31',
      question: longQuestion,
    });
    world.seedAnswer(SYNTHETIC_KEYS.registered, '9월 첫 합성', {
      dailySemaId: 'd-0901',
      createdAt: '2026-09-01T01:00:00Z',
      createdDateKst: '2026-09-01',
    });
    world.seedAnswer(SYNTHETIC_KEYS.registered, '9월 둘째 합성', {
      dailySemaId: 'd-0902',
      createdAt: '2026-09-02T01:00:00Z',
      createdDateKst: '2026-09-02',
    });
    const { router } = await openArchive(world);

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['2026년 9월', '2026년 8월']);
    const rows = screen.getAllByRole('button').filter((b) => b.classList.contains('arca-memory-row'));
    expect(rows.map((r) => r.querySelector('.arca-memory-row__meta')?.textContent)).toEqual([
      '2026년 9월 2일',
      '2026년 9월 1일',
      '2026년 8월 31일',
    ]);
    expect(rows[0]).toHaveTextContent(world.sema.primaryQuestion.text);
    expect(rows[0]?.firstElementChild).toHaveClass('arca-memory-row__meta');
    expect(screen.queryByText('9월 둘째 합성')).not.toBeInTheDocument();
    const lastQuestion = rows[2]?.querySelector('.arca-memory-row__question')?.textContent ?? '';
    expect(lastQuestion).toBe(`${'질'.repeat(80)}…`);
    expect(screen.getByText('기억 조각 3개')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: rootTabLabels.archive })).toHaveAttribute('aria-current', 'page');
    expect((await axe.run(document.body)).violations).toEqual([]);

    await userEvent.click(rows[1] as HTMLElement);
    expect(await findTitle(copy['CPY-F21-001'])).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(paths.detail);
    expect(screen.getByRole('region', { name: copy['CPY-F21-004'] })).toHaveTextContent('9월 첫 합성');
  });

  test('a saved record shows its question in F20 and its answer after opening F21', async () => {
    const booted = bootApp(server);
    await act(() => booted.started);
    await findTitle(copy['CPY-F10-001']);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
    const textarea = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
    fireEvent.change(textarea, { target: { value: '목록에 보일 합성' } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await screen.findByRole('heading', { level: 2, name: copy['CPY-F12-004'] });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F12-013'] }));

    await findTitle(copy['CPY-F20-001']);
    const list = await screen.findByRole('list');
    expect(within(list).queryByText('목록에 보일 합성')).not.toBeInTheDocument();
    const row = within(list).getByRole('button');
    expect(within(row).getByText(copy['CPY-F20-007'])).toBeInTheDocument();
    await userEvent.click(row);
    expect(await findTitle(copy['CPY-F21-001'])).toBeInTheDocument();
    expect(screen.getByRole('region', { name: copy['CPY-F21-004'] })).toHaveTextContent('목록에 보일 합성');
  });
});

function seedMany(world: MockWorld, n: number, newest = '2026-09-27') {
  const start = Date.parse(`${newest}T01:00:00Z`);
  const seeded = [];
  for (let i = 0; i < n; i += 1) {
    const at = new Date(start - i * 86_400_000).toISOString();
    seeded.push(
      world.seedAnswer(SYNTHETIC_KEYS.registered, `합성 기록 ${i + 1}`, {
        dailySemaId: `d-${i}`,
        createdAt: at,
        createdDateKst: at.slice(0, 10),
        question: { ...world.sema.primaryQuestion, text: `합성 질문 ${i + 1}` },
      }),
    );
  }
  return seeded;
}

const rowTexts = () =>
  screen
    .queryAllByRole('button')
    .filter((b) => b.classList.contains('arca-memory-row'))
    .map((r) => r.querySelector('.arca-memory-row__question')?.textContent);
const liveText = () => document.querySelector('.arca-visually-hidden[role="status"]')?.textContent ?? '';
const setScrollY = (value: number) => Object.defineProperty(window, 'scrollY', { value, configurable: true });
const listEndWatched = () => document.querySelector('.arca-list-sentinel') !== null;
const nearListEnd = () => act(() => revealObservedTargets());

describe('F20 page chain (06 §6.3, IX-023, IX-042)', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    setScrollY(0);
  });

  test('MS-LIST-001/002: 1, 2 and exactly 20 rows watch for no next page and show no end message', async () => {
    for (const n of [1, 2, 20]) {
      const world = createMockWorld('server.activeUnanswered');
      seedMany(world, n);
      const { view } = await openArchive(world);
      await vi.waitFor(() => expect(rowTexts()).toHaveLength(n));
      expect(listEndWatched()).toBe(false);
      expect(screen.queryByText(copy['CPY-F20-021'])).toBeNull();
      view.unmount();
    }
  });

  test('MS-LIST-003/004: 21 rows = 20 + 1 when the list end comes near, one heading per KST year-month across the page edge', async () => {
    const world = createMockWorld('server.activeUnanswered');
    seedMany(world, 21, '2027-01-10');
    await openArchive(world);
    await vi.waitFor(() => expect(rowTexts()).toHaveLength(20));
    expect(screen.queryByText(copy['CPY-F20-021'])).toBeNull();
    expect(screen.queryByRole('button', { name: '기록 더 보기' })).toBeNull();
    expect(listEndWatched()).toBe(true);
    const focused = document.activeElement;
    let release!: () => void;
    world.addFault('OP-010', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    await nearListEnd();
    await vi.waitFor(() => expect(document.querySelector('.arca-pixel-loader')).toHaveAttribute('aria-hidden', 'true'));
    release();

    await vi.waitFor(() => expect(rowTexts()).toHaveLength(21));
    expect(rowTexts()).toEqual(Array.from({ length: 21 }, (_, i) => `합성 질문 ${i + 1}`));
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['2027년 1월', '2026년 12월']);
    expect(screen.getByText(copy['CPY-F20-021'])).toBeInTheDocument();
    expect(liveText()).toBe(fill(copy['CPY-F20-018'], { loadedCount: '1' }));
    expect(document.activeElement).toBe(focused);
    expect(document.querySelector('.arca-pixel-loader')).toBeNull();
    expect(listEndWatched()).toBe(false);
    expect(opCount(world, 'OP-010')).toBe(2);
  });

  test('extra page failure keeps rows and retries at the same place', async () => {
    const world = createMockWorld('server.activeUnanswered');
    seedMany(world, 21);
    await openArchive(world);
    await vi.waitFor(() => expect(rowTexts()).toHaveLength(20));
    world.addFault('OP-010', { kind: 'network' }, { kind: 'network' });
    await nearListEnd();
    expect(await screen.findByText(copy['CPY-F20-019'], { selector: 'p' })).toBeInTheDocument();
    expect(rowTexts()).toHaveLength(20);
    expect(listEndWatched()).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F20-020'] }));
    await vi.waitFor(() => expect(rowTexts()).toHaveLength(21));
    expect(screen.queryByText(copy['CPY-F20-019'], { selector: 'p' })).toBeNull();
  });

  test('MS-LIST-005: other-device create/delete between pages: no insertion, no gap, no duplicate', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const seeded = seedMany(world, 22);
    await openArchive(world);
    await vi.waitFor(() => expect(rowTexts()).toHaveLength(20));
    world.seedAnswer(SYNTHETIC_KEYS.registered, '다른 기기 새 합성', {
      question: { ...world.sema.primaryQuestion, text: '다른 기기 새 질문' },
      dailySemaId: 'd-new',
      createdAt: '2026-09-28T01:00:00Z',
      createdDateKst: '2026-09-28',
    });
    world.answers.delete(seeded[20]?.answerId ?? '');
    await nearListEnd();
    await vi.waitFor(() => expect(rowTexts()).toHaveLength(21));
    const texts = rowTexts();
    expect(texts).not.toContain('다른 기기 새 질문');
    expect(texts).not.toContain('합성 질문 21');
    expect(texts.at(-1)).toBe('합성 질문 22');
    expect(new Set(texts).size).toBe(texts.length);
  });

  test('MS-LIST-005: CURSOR_INVALID keeps the rows; the same retry starts over from a fresh first page', async () => {
    const world = createMockWorld('server.activeUnanswered');
    seedMany(world, 21);
    await openArchive(world);
    await vi.waitFor(() => expect(rowTexts()).toHaveLength(20));
    world.addFault('OP-010', mockErrors.cursorInvalid);
    await nearListEnd();
    expect(await screen.findByText(copy['CPY-F20-019'], { selector: 'p' })).toBeInTheDocument();
    expect(rowTexts()).toHaveLength(20);
    expect(listEndWatched()).toBe(false);
    world.seedAnswer(SYNTHETIC_KEYS.registered, '새 첫 page 합성', {
      question: { ...world.sema.primaryQuestion, text: '새 첫 page 질문' },
      dailySemaId: 'd-new',
      createdAt: '2026-09-28T01:00:00Z',
      createdDateKst: '2026-09-28',
    });
    expect(screen.queryByRole('button', { name: '최신 기록 보기' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F20-020'] }));
    await vi.waitFor(() => expect(rowTexts()[0]).toBe('새 첫 page 질문'));
    expect(rowTexts()).toHaveLength(20);
    expect(document.activeElement).toBe(
      screen.getAllByRole('button').find((b) => b.classList.contains('arca-memory-row')),
    );
  });

  test('MS-LIST-006: a deep reader keeps the rows with no notice; the top button leads to the top where the newer list applies', async () => {
    const world = createMockWorld('server.activeUnanswered');
    seedMany(world, 2);
    await openArchive(world);
    await vi.waitFor(() => expect(rowTexts()).toHaveLength(2));
    setScrollY(600);
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.today }));
    await findTitle(copy['CPY-F10-001']);

    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
    await findTitle(copy['CPY-F20-001']);
    await vi.waitFor(() => expect(opCount(world, 'OP-010')).toBe(2));

    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.today }));
    await findTitle(copy['CPY-F10-001']);
    world.seedAnswer(SYNTHETIC_KEYS.registered, '후보 합성', {
      question: { ...world.sema.primaryQuestion, text: '후보 질문' },
      dailySemaId: 'd-new',
      createdAt: '2026-09-28T01:00:00Z',
      createdDateKst: '2026-09-28',
    });
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
    const title = await findTitle(copy['CPY-F20-001']);
    await vi.waitFor(() => expect(opCount(world, 'OP-010')).toBe(3));
    expect(rowTexts()).toEqual(['합성 질문 1', '합성 질문 2']);
    expect(screen.queryByRole('button', { name: '최신 기록 보기' })).toBeNull();
    expect(liveText()).toBe('');

    const toTop = document.querySelector('.arca-scroll-top') as HTMLButtonElement;
    setScrollY(1200);
    fireEvent.scroll(window);
    await vi.waitFor(() => expect(toTop).toHaveClass('arca-scroll-top--shown'));
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F20-025'] }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(title).toHaveFocus();
    setScrollY(0);
    fireEvent.scroll(window);
    await vi.waitFor(() => expect(rowTexts()[0]).toBe('후보 질문'));
    expect(toTop).not.toHaveClass('arca-scroll-top--shown');
    expect(toTop).toHaveAttribute('inert');
    expect(title).toHaveFocus();
  });

  test('MS-LIST-006: returning to the top applies the candidate without moving focus; a failed refresh shows no candidate', async () => {
    const world = createMockWorld('server.activeUnanswered');
    seedMany(world, 2);
    await openArchive(world);
    await vi.waitFor(() => expect(rowTexts()).toHaveLength(2));
    setScrollY(600);
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.today }));
    await findTitle(copy['CPY-F10-001']);
    world.seedAnswer(SYNTHETIC_KEYS.registered, '후보 합성', {
      question: { ...world.sema.primaryQuestion, text: '후보 질문' },
      dailySemaId: 'd-new',
      createdAt: '2026-09-28T01:00:00Z',
      createdDateKst: '2026-09-28',
    });
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
    await findTitle(copy['CPY-F20-001']);
    await vi.waitFor(() => expect(opCount(world, 'OP-010')).toBe(2));
    expect(rowTexts()).toHaveLength(2);
    const focused = document.activeElement;
    setScrollY(0);
    fireEvent.scroll(window);
    await vi.waitFor(() => expect(rowTexts()[0]).toBe('후보 질문'));
    expect(document.activeElement).toBe(focused);

    setScrollY(600);
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.today }));
    await findTitle(copy['CPY-F10-001']);
    world.addFault('OP-010', { kind: 'network' }, { kind: 'network' });
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
    expect(await screen.findByText(copy['CPY-F20-022'], { selector: 'p' })).toBeInTheDocument();
    expect(rowTexts()).toHaveLength(3);
  });

  test('tapping the current 기록 tab again scrolls to the top and keeps focus on the tab', async () => {
    const world = createMockWorld('server.activeUnanswered');
    seedMany(world, 21);
    await openArchive(world);
    await vi.waitFor(() => expect(rowTexts()).toHaveLength(20));
    setScrollY(1200);
    const current = screen.getByRole('button', { name: rootTabLabels.archive });
    expect(current).toHaveAttribute('aria-current', 'page');
    await userEvent.click(current);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(current).toHaveFocus();
    expect(screen.getByRole('heading', { level: 1, name: copy['CPY-F20-001'] })).toBeInTheDocument();
  });

  test('MS-LIST-007: list and count fail independently; the count is never taken from rows', async () => {
    const world = createMockWorld('server.activeUnanswered');
    seedMany(world, 3);
    await openArchive(world);
    await vi.waitFor(() => expect(rowTexts()).toHaveLength(3));
    expect(screen.getByText('기억 조각 3개')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.today }));
    await findTitle(copy['CPY-F10-001']);
    world.seedAnswer(SYNTHETIC_KEYS.registered, '네 번째 합성', {
      dailySemaId: 'd-new',
      createdAt: '2026-09-28T01:00:00Z',
      createdDateKst: '2026-09-28',
    });
    world.addFault('OP-005', { kind: 'network' }, { kind: 'network' });
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
    await vi.waitFor(() => expect(rowTexts()).toHaveLength(4));
    expect(screen.queryByText('기억 조각 4개')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.today }));
    await findTitle(copy['CPY-F10-001']);
    world.addFault('OP-010', { kind: 'network' }, { kind: 'network' });
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
    expect(await screen.findByText(copy['CPY-F20-022'], { selector: 'p' })).toBeInTheDocument();
    expect(await screen.findByText('기억 조각 4개')).toBeInTheDocument();
    expect(rowTexts()).toHaveLength(4);
  });

  test('MS-NAV-001: F21 → Back restores the kept chain and anchor without a refresh; a tab entry refreshes', async () => {
    const world = createMockWorld('server.activeUnanswered');
    seedMany(world, 21);
    const { router } = await openArchive(world);
    await vi.waitFor(() => expect(rowTexts()).toHaveLength(20));
    await nearListEnd();
    await vi.waitFor(() => expect(rowTexts()).toHaveLength(21));
    const before = opCount(world, 'OP-010');

    const rows = screen.getAllByRole('button').filter((b) => b.classList.contains('arca-memory-row'));
    await userEvent.click(rows[20] as HTMLElement);
    await findTitle(copy['CPY-F21-001']);
    await act(() => router.navigate(-1));
    await findTitle(copy['CPY-F20-001']);
    expect(rowTexts()).toHaveLength(21);
    expect(window.scrollTo).toHaveBeenCalled();
    expect(opCount(world, 'OP-010')).toBe(before);

    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.today }));
    await findTitle(copy['CPY-F10-001']);
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
    await vi.waitFor(() => expect(opCount(world, 'OP-010')).toBe(before + 1));
  });
});
