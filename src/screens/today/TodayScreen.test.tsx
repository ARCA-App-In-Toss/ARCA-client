import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { createMockWorld, SYNTHETIC_ANSWER_TEXT, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { bootApp, findFocusedTitle, findTitle, opCount } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('F10 unanswered (IX-006, IX-033)', () => {
  test('primary question first; F00 data reused without a second OP-005', async () => {
    const { world, started } = bootApp(server);
    await act(() => started);
    await findFocusedTitle(copy['CPY-F10-001']);

    const question = screen.getByRole('region', { name: copy['CPY-F10-003'] });
    expect(within(question).getByText(world.sema.primaryQuestion.text)).toBeInTheDocument();
    expect(within(question).getByText('2026년 9월 27일')).toHaveAttribute('datetime', '2026-09-27');
    expect(screen.queryByText('SEMA 코드 · SEMA-0270')).not.toBeInTheDocument();
    expect(screen.queryByText(copy['CPY-F10-008'])).not.toBeInTheDocument();
    expect(screen.getByText('기억 조각 0개').closest('.arca-root-header')).not.toBeNull();
    expect(opCount(world, 'OP-005')).toBe(1);
    expect((await axe.run(document.body)).violations).toEqual([]);
  });

  test('switch toggles primary ↔ alternate only, keeps focus, renames itself and announces once', async () => {
    const { world, started } = bootApp(server);
    await act(() => started);
    await findTitle(copy['CPY-F10-001']);

    const toggle = screen.getByRole('button', { name: copy['CPY-F10-006'] });
    await userEvent.click(toggle);
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAccessibleName(copy['CPY-F10-007']);
    expect(screen.getByText(world.sema.alternateQuestion.text, { selector: '.arca-question' })).toBeInTheDocument();
    expect(screen.getAllByRole('status').some((s) => s.textContent?.includes(world.sema.alternateQuestion.text))).toBe(
      true,
    );

    await userEvent.click(toggle);
    expect(toggle).toHaveAccessibleName(copy['CPY-F10-006']);
    expect(screen.getByText(world.sema.primaryQuestion.text, { selector: '.arca-question' })).toBeInTheDocument();
  });

  test('write opens F11 with only the question role and route epoch in history state', async () => {
    const { router, started } = bootApp(server);
    await act(() => started);
    await findTitle(copy['CPY-F10-001']);

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-006'] }));
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
    expect(router.state.location.pathname).toBe(paths.write);
    expect(router.state.location.state).toEqual({ routeEpoch: expect.any(Number), questionRole: 'ALTERNATE' });
    expect(router.state.location.search).toBe('');
  });
});

describe('F10 capsule sky', () => {
  test('follows the device hour on entry and re-reads it only when the app returns to the foreground', async () => {
    let now = new Date(2026, 8, 27, 18, 30).getTime();
    const { platform, started } = bootApp(server, { now: () => now });
    await act(() => started);
    await findTitle(copy['CPY-F10-001']);
    const sky = () => document.querySelector('[data-sky]');
    expect(sky()).toHaveAttribute('data-sky', 'dusk');

    now = new Date(2026, 8, 27, 20, 0).getTime();
    expect(sky()).toHaveAttribute('data-sky', 'dusk');
    act(() => platform.setVisible(false));
    expect(sky()).toHaveAttribute('data-sky', 'dusk');
    act(() => platform.setVisible(true));
    expect(sky()).toHaveAttribute('data-sky', 'night');
    expect(sky()?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('F10 answered (IX-027, IX-033)', () => {
  test('saved question, completion line and detail entry only: no answer text, switch or new write', async () => {
    const { world, started } = bootApp(server, { base: 'server.activeAnswered' });
    await act(() => started);
    await findTitle(copy['CPY-F10-001']);

    expect(document.querySelector('.arca-sender')).toHaveTextContent(copy['CPY-F10-011']);
    expect(screen.getByRole('button', { name: copy['CPY-F10-016'] })).toBeInTheDocument();
    expect(document.querySelector('.arca-user-text')).toBeNull();
    expect(document.body.textContent).not.toContain(SYNTHETIC_ANSWER_TEXT);
    expect(screen.queryByRole('button', { name: copy['CPY-F10-005'] })).toBeNull();
    expect(screen.queryByRole('button', { name: copy['CPY-F10-006'] })).toBeNull();
    expect(screen.getByRole('region', { name: copy['CPY-F10-015'] })).toHaveTextContent(
      world.sema.primaryQuestion.text,
    );
    expect(
      within(screen.getByRole('region', { name: copy['CPY-F10-015'] })).getByText('2026년 9월 27일'),
    ).toHaveAttribute('datetime', '2026-09-27');
    expect(screen.queryByText(copy['CPY-F10-008'])).not.toBeInTheDocument();
    expect(screen.queryByText('SEMA 코드 · SEMA-0270')).not.toBeInTheDocument();
    expect(screen.getByText('기억 조각 1개')).toBeInTheDocument();
    expect((await axe.run(document.body)).violations).toEqual([]);
  });

  test('a long answer is not shown on F10 even though the excerpt is available', async () => {
    const world = createMockWorld('server.activeUnanswered');
    world.seedAnswer(SYNTHETIC_KEYS.registered, `긴 합성 답변 ${'가'.repeat(200)}`);
    const { started } = bootApp(server, { world });
    await act(() => started);
    await findTitle(copy['CPY-F10-001']);
    expect(document.querySelector('.arca-sender')).toHaveTextContent(copy['CPY-F10-011']);
    expect(document.body.textContent).not.toContain('긴 합성 답변');
  });

  test('detail action opens F21 with a local opaque ref in history state: no server id in history or URL', async () => {
    const { router, started, world } = bootApp(server, { base: 'server.activeAnswered' });
    await act(() => started);
    await findTitle(copy['CPY-F10-001']);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-016'] }));
    const [answer] = world.answersOf(SYNTHETIC_KEYS.registered);
    const state = router.state.location.state as { answerRef?: string };
    expect(typeof state.answerRef).toBe('string');
    expect(JSON.stringify(state)).not.toContain(answer?.answerId ?? '#');
    expect(router.state.location.pathname + router.state.location.search).not.toContain(answer?.answerId ?? '#');
    expect(await findTitle(copy['CPY-F21-001'])).toBeInTheDocument();
  });
});

describe('F21 read-back (MS-CORE-001 read side)', () => {
  test('detail shows the saved question snapshot first and the stored text verbatim', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const content = '  첫 줄\n\n  공백과 빈 줄 유지 👩‍👩‍👧 (synthetic)  ';
    world.seedAnswer(SYNTHETIC_KEYS.registered, content);
    const { started } = bootApp(server, { world });
    await act(() => started);
    await findTitle(copy['CPY-F10-001']);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-016'] }));

    await findFocusedTitle(copy['CPY-F21-001']);
    const regions = screen.getAllByRole('region');
    expect(regions[0]).toHaveAccessibleName(copy['CPY-F21-002']);
    expect(regions[1]).toHaveAccessibleName(copy['CPY-F21-004']);
    expect(regions[1]?.querySelector('.arca-user-text')?.textContent).toBe(content);
    expect(
      within(screen.getByRole('region', { name: copy['CPY-F21-002'] })).getByText('2026년 9월 27일'),
    ).toHaveAttribute('datetime', '2026-09-27');
    expect((await axe.run(document.body)).violations).toEqual([]);
  });

  test('a cold entry without a ref goes to the parent list instead of guessing', async () => {
    const { router, started } = bootApp(server, { initialPath: paths.detail });
    await act(() => started);
    expect(await findTitle(copy['CPY-F20-001'])).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(paths.archive);
  });
});

describe('F10 single live region (02 §12.4)', () => {
  test('the answered state exposes exactly one live region', async () => {
    const world = createMockWorld('server.activeUnanswered');
    world.seedAnswer(SYNTHETIC_KEYS.registered, '발췌 없음 합성');
    const { started } = bootApp(server, { world });
    await act(() => started);
    await findTitle(copy['CPY-F10-001']);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
