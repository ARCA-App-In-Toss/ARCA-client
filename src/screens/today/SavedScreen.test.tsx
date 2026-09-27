import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { createMockWorld, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { bootApp, findTitle, opCount } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function saveOnce(world: ReturnType<typeof createMockWorld>, text: string) {
  const booted = bootApp(server, { world });
  await act(() => booted.started);
  await findTitle(copy['CPY-F10-001']);
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
  const textarea = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
  fireEvent.change(textarea, { target: { value: text } });
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
  await screen.findByRole('heading', { level: 2, name: copy['CPY-F12-004'] });
  return booted;
}

const actionButtons = () =>
  screen
    .getAllByRole('button')
    .filter((b) => ([copy['CPY-F12-013'], copy['CPY-F12-014']] as string[]).includes(b.textContent ?? ''));

describe('F12 completion hierarchy (IX-039)', () => {
  test('MS-CORE-010 existing memory on another day: count 2 → today first, repeat line shown', async () => {
    const world = createMockWorld('server.activeUnanswered');
    world.seedAnswer(SYNTHETIC_KEYS.registered, '어제 합성', {
      dailySemaId: 'synthetic-yesterday',
      createdAt: '2026-09-26T01:00:00Z',
      createdDateKst: '2026-09-26',
    });
    await saveOnce(world, '오늘 합성');
    expect(screen.getByRole('group', { name: copy['CPY-F12-019'] })).toHaveTextContent('기억 조각 2개');
    expect(screen.getByText(copy['CPY-F12-006'])).toBeInTheDocument();
    const [first, second] = actionButtons();
    expect(first).toHaveTextContent(copy['CPY-F12-014']);
    expect(first).toHaveClass('arca-button--primary');
    expect(second).toHaveTextContent(copy['CPY-F12-013']);
  });

  test('MS-CORE-008 info unavailable: result kept, today first, re-query fills info without re-saving', async () => {
    const world = createMockWorld('server.activeUnanswered');
    world.presentationUnavailable = true;
    await saveOnce(world, '정보 늦은 합성');
    const result = screen.getByRole('heading', { level: 2, name: copy['CPY-F12-004'] });
    expect(result).toHaveFocus();
    expect(screen.getAllByRole('status').some((s) => s.textContent === copy['CPY-F12-016'])).toBe(true);
    expect(screen.getByRole('group', { name: copy['CPY-F12-019'] })).toHaveTextContent(copy['CPY-F12-017']);
    const before = actionButtons();
    expect(before[0]).toHaveTextContent(copy['CPY-F12-014']);
    expect(before[0]).toHaveClass('arca-button--primary');
    const opsBefore = { prepare: opCount(world, 'OP-006'), execute: opCount(world, 'OP-007') };

    const requery = screen.getByRole('button', { name: copy['CPY-F12-018'] });
    await userEvent.click(requery);
    await waitFor(() =>
      expect(screen.getByRole('group', { name: copy['CPY-F12-019'] })).toHaveTextContent('기억 조각 1개'),
    );
    expect(document.querySelector('.arca-user-text')?.textContent).toBe('정보 늦은 합성');
    // A late count of 1 does not reorder, rename or re-emphasise the buttons in this visit.
    const after = actionButtons();
    expect(after[0]).toHaveTextContent(copy['CPY-F12-014']);
    expect(after[0]).toHaveClass('arca-button--primary');
    // Focus stays where the user put it; arriving info never moves it (IX-039).
    expect(requery).toHaveFocus();
    expect(opCount(world, 'OP-006')).toBe(opsBefore.prepare);
    expect(opCount(world, 'OP-007')).toBe(opsBefore.execute);
  });
});
