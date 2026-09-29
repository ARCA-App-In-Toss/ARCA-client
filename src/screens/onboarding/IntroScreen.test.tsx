import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
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

function reducedMotion(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: matches && query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

const readableSentence = () => document.querySelector('.arca-intro-dialog > p.arca-visually-hidden')?.textContent;
const visibleLine = () =>
  Array.from(
    document.querySelectorAll('.arca-intro-line:not(.arca-intro-line--ghost) > span:not(.arca-intro-line__rest)'),
  )
    .map((span) => span.textContent)
    .join('');
const sentencesOf = (
  id: 'CPY-F01-013' | 'CPY-F01-014' | 'CPY-F01-015' | 'CPY-F01-016' | 'CPY-F01-017' | 'CPY-F01-018',
) => copy[id].split('\n\n');

describe('F01 intro (IX-030, MS-ONB-003)', () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  test('Reduced Motion: sentences replace one another, scenes advance, then only the boarding Primary remains', async () => {
    reducedMotion(true);
    const { world, router } = await bootIntro();
    expect(screen.getByRole('img', { name: '6개 중 1번째 장면' })).toHaveTextContent('1 / 6');
    const [first, second] = sentencesOf('CPY-F01-013');
    expect(first).toBe('2999년 지구,\n인류는 평행우주의 실재를 확인했습니다.');
    expect(visibleLine()).toBe(first);

    const next = button(copy['CPY-F01-004']);
    await userEvent.click(next);
    expect(visibleLine()).toBe(second);
    expect(screen.getByRole('status').textContent).toBe(second);
    expect(screen.getByRole('img', { name: '6개 중 1번째 장면' })).toBeInTheDocument();

    await userEvent.click(next);
    const label = '6개 중 2번째 장면';
    expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).toBe(`${label}. ${sentencesOf('CPY-F01-014')[0]}`);
    expect(next).toHaveFocus();

    for (let press = 0; press < 10; press += 1) await userEvent.click(next);
    expect(screen.getByRole('img', { name: '6개 중 6번째 장면' })).toBeInTheDocument();
    expect(visibleLine()).toBe(sentencesOf('CPY-F01-018')[2]);
    expect(screen.queryByRole('button', { name: copy['CPY-F01-005'] })).toBeNull();
    await userEvent.click(next);
    expect(document.querySelector('.arca-intro-dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: copy['CPY-F01-004'] })).toBeNull();
    expect(button(copy['CPY-F01-005'])).toHaveFocus();
    await userEvent.click(document.querySelector('.arca-intro-view') as HTMLElement);
    expect(button(copy['CPY-F01-005'])).toBeInTheDocument();
    await userEvent.click(button(copy['CPY-F01-005']));

    expect(await findTitle(copy['CPY-F02-001'])).toHaveFocus();
    expect(router.state.location.pathname).toBe(paths.join);
    expect(opCount(world, 'OP-003')).toBe(0);
  });

  test('typing: the first press completes the sentence, the next press moves on; the full text stays readable', async () => {
    reducedMotion(false);
    await bootIntro();
    const [first, second] = sentencesOf('CPY-F01-013');
    expect(visibleLine().length).toBeLessThan(Array.from(first ?? '').length);
    expect(readableSentence()).toBe(first);

    await userEvent.click(button(copy['CPY-F01-004']));
    expect(visibleLine()).toBe(first);
    await userEvent.click(button(copy['CPY-F01-004']));
    expect(visibleLine()).not.toBe(second);
    expect(readableSentence()).toBe(second);
  });

  test('typing: the next sentence starts empty; no leftover slice of it paints before typing', async () => {
    reducedMotion(false);
    await bootIntro();
    const [, second] = sentencesOf('CPY-F01-013');
    await userEvent.click(button(copy['CPY-F01-004']));
    const reHidden: string[] = [];
    const dialog = document.querySelector('.arca-intro-dialog') as HTMLElement;
    const collect = (records: MutationRecord[]) => {
      for (const record of records) {
        const target = record.target as Element;
        if (record.type !== 'attributes' || target.tagName !== 'SPAN') continue;
        const hiddenNow = target.classList.contains('arca-intro-line__rest');
        const hiddenBefore = record.oldValue?.includes('arca-intro-line__rest') ?? false;
        if (hiddenNow && !hiddenBefore) reHidden.push(target.textContent ?? '');
      }
    };
    const observer = new MutationObserver(collect);
    observer.observe(dialog, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    await userEvent.click(button(copy['CPY-F01-004']));
    collect(observer.takeRecords());
    observer.disconnect();
    expect(readableSentence()).toBe(second);
    expect(reHidden).toEqual([]);
  });

  test('a tap on the stage and Enter outside a control advance like the next control', async () => {
    reducedMotion(true);
    await bootIntro();
    const [, second] = sentencesOf('CPY-F01-013');
    await userEvent.click(document.querySelector('.arca-intro-view') as HTMLElement);
    expect(visibleLine()).toBe(second);
    screen.getByRole('heading', { level: 1, name: copy['CPY-F01-001'] }).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('img', { name: '6개 중 2번째 장면' })).toBeInTheDocument();
  });

  test('skip from a middle scene opens F02 without creating a passenger', async () => {
    reducedMotion(true);
    const { world } = await bootIntro();
    await userEvent.click(button(copy['CPY-F01-004']));
    await userEvent.click(button(copy['CPY-F01-004']));
    await userEvent.click(button(copy['CPY-F01-006']));
    await findTitle(copy['CPY-F02-001']);
    expect(opCount(world, 'OP-003')).toBe(0);
  });

  test('a scene image that fails to load falls back to its code scene without blocking the story (06 §10.5)', async () => {
    reducedMotion(true);
    await bootIntro();
    const backdrop = document.querySelector('.arca-intro-backdrop') as HTMLElement;
    const image = backdrop.querySelector('img.arca-intro-scene') as HTMLImageElement;
    expect(image.getAttribute('src')).toContain('scene-1');
    fireEvent.error(image);
    expect(backdrop.querySelector('img')).toBeNull();
    expect(backdrop.querySelector('svg.arca-intro-art')).not.toBeNull();
    await userEvent.click(button(copy['CPY-F01-004']));
    await userEvent.click(button(copy['CPY-F01-004']));
    expect(screen.getByRole('img', { name: '6개 중 2번째 장면' })).toBeInTheDocument();
    expect(backdrop.querySelector('img.arca-intro-scene')?.getAttribute('src')).toContain('scene-2');
  });

  test('a scene change settles the next image over the previous one; Reduced Motion swaps at once (02 §7.1)', async () => {
    reducedMotion(false);
    await bootIntro();
    const backdrop = document.querySelector('.arca-intro-backdrop') as HTMLElement;
    for (let press = 0; press < 4; press += 1) await userEvent.click(button(copy['CPY-F01-004']));
    expect(screen.getByRole('img', { name: '6개 중 2번째 장면' })).toBeInTheDocument();
    const layers = backdrop.querySelectorAll('img.arca-intro-scene');
    expect(Array.from(layers, (image) => image.getAttribute('src'))).toEqual([
      expect.stringContaining('scene-1'),
      expect.stringContaining('scene-2'),
    ]);
    expect(layers[1]).toHaveClass('arca-intro-scene--entering');
    fireEvent(layers[1] as HTMLImageElement, new Event('webkitAnimationEnd', { bubbles: true }));
    expect(backdrop.querySelectorAll('img')).toHaveLength(1);

    reducedMotion(true);
    for (let press = 0; press <= sentencesOf('CPY-F01-014').length; press += 1) {
      await userEvent.click(button(copy['CPY-F01-004']));
    }
    expect(screen.getByRole('img', { name: '6개 중 3번째 장면' })).toBeInTheDocument();
    expect(backdrop.querySelectorAll('img')).toHaveLength(1);
  });

  test('boarding Primary takes focus; a tap-led arrival hides the ring until a key is pressed, a key-led arrival shows it', async () => {
    reducedMotion(true);
    await bootIntro();
    for (let press = 0; press < 40 && !screen.queryByRole('button', { name: copy['CPY-F01-005'] }); press += 1) {
      await userEvent.click(button(copy['CPY-F01-004']));
    }
    const board = button(copy['CPY-F01-005']);
    expect(board).toHaveFocus();
    expect(board).toHaveAttribute('data-quiet-focus');
    await userEvent.keyboard('{Shift}');
    expect(board).toHaveFocus();
    expect(board).not.toHaveAttribute('data-quiet-focus');
  });

  test('keyboard-led arrival at boarding keeps the visible focus ring', async () => {
    reducedMotion(true);
    await bootIntro();
    (document.activeElement as HTMLElement | null)?.blur();
    for (let press = 0; press < 40 && !screen.queryByRole('button', { name: copy['CPY-F01-005'] }); press += 1) {
      fireEvent.keyDown(document.body, { key: 'Enter' });
      await act(async () => {});
    }
    const board = button(copy['CPY-F01-005']);
    expect(board).toHaveFocus();
    expect(board).not.toHaveAttribute('data-quiet-focus');
  });

  test('the last sentence fades the dialog out before the boarding Primary fades in (02 §7.1)', async () => {
    reducedMotion(false);
    await bootIntro();
    const closing = () => document.querySelector('.arca-intro-dialog--closing');
    for (let press = 0; press < 40 && !closing(); press += 1) {
      await userEvent.click(button(copy['CPY-F01-004']));
    }
    expect(closing()).not.toBeNull();
    expect(screen.queryByRole('button', { name: copy['CPY-F01-005'] })).toBeNull();
    const board = await screen.findByRole('button', { name: copy['CPY-F01-005'] });
    expect(document.querySelector('.arca-intro-dialog')).toBeNull();
    expect(board.parentElement).toHaveClass('arca-intro-board');
    expect(board).toHaveFocus();
  });

  test('boarding fades the intro into the canvas before F02 opens; Reduced Motion opens it at once (02 §7.1)', async () => {
    reducedMotion(false);
    const { router } = await bootIntro();
    for (let press = 0; press < 40 && !document.querySelector('.arca-intro-dialog--closing'); press += 1) {
      await userEvent.click(button(copy['CPY-F01-004']));
    }
    await userEvent.click(await screen.findByRole('button', { name: copy['CPY-F01-005'] }));
    expect(document.querySelector('.arca-intro-curtain')).not.toBeNull();
    expect(router.state.location.pathname).not.toBe(paths.join);
    expect(
      await screen.findByRole('heading', { level: 1, name: copy['CPY-F02-001'] }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(paths.join);
  });

  test('skip on the first scene opens F02 with no confirmation step', async () => {
    await bootIntro();
    await userEvent.click(button(copy['CPY-F01-006']));
    await findTitle(copy['CPY-F02-001']);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
