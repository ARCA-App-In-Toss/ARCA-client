import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { createMockWorld, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { bootApp, findTitle } from '../../test/boot.tsx';
import { copy, rootTabLabels } from '../../ui/copy.ts';

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
  test('empty: one state panel with a single action to today', async () => {
    await openArchive();
    expect(await screen.findByRole('heading', { level: 2, name: copy['CPY-F20-011'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F20-013'] }));
    expect(await findTitle(copy['CPY-F10-001'])).toBeInTheDocument();
  });

  test('newest first, month headings only where the KST year-month changes, row opens F21', async () => {
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
    expect(rows.map((r) => r.querySelector('.arca-user-text')?.textContent)).toEqual([
      '9월 둘째 합성',
      '9월 첫 합성',
      '8월 합성',
    ]);
    const lastQuestion = rows[2]?.querySelector('.arca-text-secondary')?.textContent ?? '';
    expect(lastQuestion).toBe(`${'질'.repeat(80)}…`);
    expect(screen.getByText('기억 조각 3개')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: rootTabLabels.archive })).toHaveAttribute('aria-current', 'page');
    expect((await axe.run(document.body)).violations).toEqual([]);

    await userEvent.click(rows[1] as HTMLElement);
    expect(await findTitle(copy['CPY-F21-001'])).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(paths.detail);
    expect(screen.getByRole('region', { name: copy['CPY-F21-004'] })).toHaveTextContent('9월 첫 합성');
  });

  test('a saved answer appears in F20 after F12 → 항해 기록 보기', async () => {
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
    expect(within(list).getByText('목록에 보일 합성')).toBeInTheDocument();
  });
});
