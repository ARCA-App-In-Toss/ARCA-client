import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import introStory from '../../../docs/ARCA_INTRO_STORY.txt?raw';
import { paths } from '../../app/navigation.ts';
import { bootApp, findTitle, opCount } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function bootIntro() {
  const booted = bootApp(server, { base: 'server.prePassenger' });
  await act(() => booted.started);
  await findTitle(copy['CPY-F01-001']);
  return booted;
}

const button = (name: string) => screen.getByRole('button', { name });

describe('F01 intro (IX-030, MS-ONB-003)', () => {
  test('scenes advance in order; the last Primary opens F02 without creating a passenger', async () => {
    const { world, router } = await bootIntro();
    expect(screen.getByRole('img', { name: '3개 중 1번째 장면' })).toHaveTextContent('1 / 3');
    expect(screen.getByText(/또 다른 나를 만나면/)).toBeInTheDocument();

    await userEvent.click(button(copy['CPY-F01-004']));
    expect(screen.getByRole('img', { name: '3개 중 2번째 장면' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/긴 동면의 항해 동안/);
    expect(button(copy['CPY-F01-004'])).toHaveFocus();

    await userEvent.click(button(copy['CPY-F01-004']));
    expect(screen.queryByRole('button', { name: copy['CPY-F01-004'] })).toBeNull();
    await userEvent.click(button(copy['CPY-F01-005']));

    expect(await findTitle(copy['CPY-F02-001'])).toHaveFocus();
    expect(router.state.location.pathname).toBe(paths.join);
    expect(opCount(world, 'OP-003')).toBe(0);
  });

  test('story expand keeps the scene, collapse restores focus to the toggle, skip from story opens F02', async () => {
    const { world } = await bootIntro();
    await userEvent.click(button(copy['CPY-F01-004']));

    await userEvent.click(button(copy['CPY-F01-007']));
    expect(screen.getByRole('heading', { level: 2, name: copy['CPY-F01-009'] })).toHaveFocus();
    const story = screen.getByRole('region', { name: copy['CPY-F01-009'] });
    expect(story.querySelector('.arca-narrative')?.textContent).toBe(introStory);
    expect(screen.getByRole('img', { name: '3개 중 2번째 장면' })).toBeInTheDocument();

    const [toggle, bottomCollapse] = screen.getAllByRole('button', { name: copy['CPY-F01-008'] });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(bottomCollapse as HTMLElement);
    expect(screen.queryByRole('region', { name: copy['CPY-F01-009'] })).toBeNull();
    expect(button(copy['CPY-F01-007'])).toHaveFocus();
    expect(screen.getByRole('img', { name: '3개 중 2번째 장면' })).toBeInTheDocument();

    await userEvent.click(button(copy['CPY-F01-007']));
    await userEvent.click(button(copy['CPY-F01-006']));
    await findTitle(copy['CPY-F02-001']);
    expect(opCount(world, 'OP-003')).toBe(0);
  });

  test('skip on the first scene opens F02 with no confirmation step', async () => {
    await bootIntro();
    await userEvent.click(button(copy['CPY-F01-006']));
    await findTitle(copy['CPY-F02-001']);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
