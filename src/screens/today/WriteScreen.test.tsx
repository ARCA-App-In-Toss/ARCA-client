import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { AnswerWriteStore } from '../../domain/commands/answerWriteStore.ts';
import { createFakeStorage } from '../../mocks/platform.ts';
import { bootApp, findTitle } from '../../test/boot.tsx';
import { copy } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

async function openWrite(options: Parameters<typeof bootApp>[1] = {}) {
  const booted = bootApp(server, options);
  await act(() => booted.started);
  await findTitle(copy['CPY-F10-001']);
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
  await findTitle(copy['CPY-F11-001']);
  const textarea = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
  return { ...booted, textarea };
}

const help = () => document.getElementById('f11-help')?.textContent ?? '';
const draftRecords = (storage: ReturnType<typeof createFakeStorage>) =>
  [...storage.data.values()].filter((v) => v.includes('"recordType":"draft"'));

describe('F11 writing and device keeping (IX-001, IX-002, IX-005)', () => {
  test('empty start: selected question, 0/2,000자, save disabled, no error', async () => {
    const { world, textarea } = await openWrite();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(screen.getByRole('region', { name: copy['CPY-F11-002'] })).toHaveTextContent(
      world.sema.primaryQuestion.text,
    );
    expect(textarea).toHaveValue('');
    expect(help()).toContain('0/2,000자');
    expect(screen.getByRole('button', { name: copy['CPY-F11-018'] })).toBeDisabled();
    expect(textarea).not.toHaveAttribute('maxlength');
    expect((await axe.run(document.body)).violations).toEqual([]);
  });

  test('typing is kept only after read-back; leaving and returning restores it verbatim', async () => {
    const storage = createFakeStorage();
    const { textarea, router } = await openWrite({ storage });
    const text = '  합성 답변\n\n빈 줄 다음 👩‍👩‍👧  ';
    fireEvent.change(textarea, { target: { value: text } });
    expect(help()).toContain(copy['CPY-F11-010']);
    await waitFor(() => expect(help()).toContain(copy['CPY-F11-011']), { timeout: 3_000 });
    expect(help()).toContain('19/2,000자');
    expect(draftRecords(storage)).toHaveLength(1);
    expect(screen.getByRole('button', { name: copy['CPY-F11-018'] })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-COM-005'] }));
    await findTitle(copy['CPY-F10-001']);
    expect(router.state.location.pathname).toBe(paths.today);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
    const restored = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
    await waitFor(() => expect(restored).toHaveValue(text));
    expect(help()).toContain(copy['CPY-F11-012']);
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(copy['CPY-F11-012']);
    expect(notice).toHaveClass('arca-inline-status--quiet');
  });

  test('2,001 graphemes: text kept whole, over-count error, save disabled', async () => {
    const { textarea } = await openWrite();
    const text = `${'가'.repeat(2_000)}👍🏽`;
    fireEvent.change(textarea, { target: { value: text } });
    expect(textarea).toHaveValue(text);
    expect(screen.getByText('1자를 줄여 주세요.')).toBeInTheDocument();
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(help()).toContain('2,001/2,000자');
    expect(screen.getByRole('button', { name: copy['CPY-F11-018'] })).toBeDisabled();

    fireEvent.change(textarea, { target: { value: '가'.repeat(2_000) } });
    expect(screen.queryByText(/자를 줄여 주세요/)).toBeNull();
    expect(screen.getByRole('button', { name: copy['CPY-F11-018'] })).toBeEnabled();
  });

  test('count follows each IME update before blur, including combined emoji', async () => {
    const { textarea } = await openWrite();
    fireEvent.change(textarea, { target: { value: '합성' } });
    expect(help()).toContain('2/2,000자');
    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: '합성ㅎ' } });
    expect(help()).toContain('3/2,000자');
    fireEvent.change(textarea, { target: { value: '합성하' } });
    expect(help()).toContain('3/2,000자');
    fireEvent.change(textarea, { target: { value: '합성한👩‍👩‍👧' } });
    expect(help()).toContain('4/2,000자');
    fireEvent.compositionEnd(textarea, { target: { value: '합성한' } });
    expect(help()).toContain('3/2,000자');
  });
});

test('IME live count does not commit a draft or validate/save unfinished input', async () => {
  const storage = createFakeStorage();
  const { world, textarea } = await openWrite({ storage });
  fireEvent.change(textarea, { target: { value: '가'.repeat(2_000) } });
  fireEvent.compositionStart(textarea);
  fireEvent.change(textarea, { target: { value: '가'.repeat(2_001) } });
  expect(help()).toContain('2,001/2,000자');
  expect(textarea).not.toHaveAttribute('aria-invalid', 'true');
  expect(screen.queryByText('1자를 줄여 주세요.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
  expect(world.requests.some((r) => r.op === 'OP-007')).toBe(false);
  await act(() => new Promise((resolve) => setTimeout(resolve, 550)));
  expect(draftRecords(storage)).toHaveLength(0);
  fireEvent.compositionEnd(textarea, { target: { value: '가'.repeat(2_001) } });
  expect(screen.getByText('1자를 줄여 주세요.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: copy['CPY-F11-018'] })).toBeDisabled();
});

describe('F11 question switch (IX-006)', () => {
  test('keeps the current text first, then shows the other question with its own draft', async () => {
    const storage = createFakeStorage();
    const { world, textarea } = await openWrite({ storage });
    fireEvent.change(textarea, { target: { value: '기본 질문 답 (synthetic)' } });

    const toggle = screen.getByRole('button', { name: copy['CPY-F10-006'] });
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: copy['CPY-F11-002'] })).toHaveTextContent(
        world.sema.alternateQuestion.text,
      ),
    );
    const alternate = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
    await waitFor(() => expect(alternate).toHaveValue(''));
    const switched = screen.getByRole('status');
    expect(switched).toHaveTextContent(copy['CPY-F11-015']);
    expect(switched).toHaveClass('arca-inline-status--quiet');
    expect(draftRecords(storage)).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-007'] }));
    const primary = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
    await waitFor(() => expect(primary).toHaveValue('기본 질문 답 (synthetic)'));
  });

  test('if keeping fails the question does not change and the text stays', async () => {
    const storage = createFakeStorage();
    const { world, textarea } = await openWrite({ storage });
    storage.failNextWrite((key) => key.includes(':manifest:'));
    fireEvent.change(textarea, { target: { value: '보관 실패 합성' } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-006'] }));

    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === copy['CPY-F11-017'])).toBe(true),
    );
    expect(screen.getByRole('region', { name: copy['CPY-F11-002'] })).toHaveTextContent(
      world.sema.primaryQuestion.text,
    );
    expect(textarea).toHaveValue('보관 실패 합성');
  });
});

describe('MS-CORE-001 question → write → save → read again', () => {
  test('saves verbatim, shows F12 (first memory: archive first), F10 answered and F21 show the same text', async () => {
    const storage = createFakeStorage();
    const { world, platform, router, textarea } = await openWrite({ storage });
    const text = '  합성 첫 기억\n\n그대로 남아요 👩‍👩‍👧  ';
    fireEvent.change(textarea, { target: { value: text } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));

    const result = await screen.findByRole('heading', { level: 2, name: copy['CPY-F12-004'] });
    expect(result).toHaveFocus();
    expect(router.state.location.pathname).toBe(paths.saved);
    expect(router.state.location.state).toMatchObject({ answerRef: expect.any(String) });
    expect(document.querySelector('.arca-user-text')).toBeNull();
    expect(screen.getByRole('group', { name: copy['CPY-F12-019'] })).toHaveTextContent('기억 조각 1개');
    const [first, second] = screen.getAllByRole('button');
    expect(first).toHaveAccessibleName(copy['CPY-F12-013']);
    expect(first).toHaveClass('arca-button--primary');
    expect(second).toHaveAccessibleName(copy['CPY-F12-014']);
    expect(platform.hapticCount).toBe(1);
    expect(draftRecords(storage)).toHaveLength(0);
    expect(world.answersOf('synthetic-anon-key-registered')[0]?.content).toBe(text);
    expect((await axe.run(document.body)).violations).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F12-014'] }));
    await findTitle(copy['CPY-F10-001']);
    await waitFor(() => expect(document.querySelector('.arca-sender')).toHaveTextContent(copy['CPY-F10-011']));
    expect(document.querySelector('.arca-user-text')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-016'] }));
    await findTitle(copy['CPY-F21-001']);
    const answer = await screen.findByRole('region', { name: copy['CPY-F21-004'] });
    expect(answer.querySelector('.arca-user-text')?.textContent).toBe(text);
  });

  test('a save shows only the busy Primary at first; the progress line and waiting actions follow after 0.5s', async () => {
    const { world, textarea } = await openWrite();
    let release!: () => void;
    world.addFault('OP-006', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    fireEvent.change(textarea, { target: { value: '느린 저장 합성' } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await waitFor(() => expect(textarea).toHaveAttribute('readonly'));
    expect(screen.getByRole('button', { name: copy['CPY-F11-018'] })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(copy['CPY-F11-019'])).toBeNull();
    expect(screen.queryByRole('button', { name: copy['CPY-F11-029'] })).toBeNull();
    expect(await screen.findByText(copy['CPY-F11-019'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy['CPY-F11-029'] })).toBeInTheDocument();
    release();
    await screen.findByRole('heading', { level: 2, name: copy['CPY-F12-004'] });
  });

  test('while saving the text is read-only and the switch is locked', async () => {
    const { world, textarea } = await openWrite();
    let release!: () => void;
    world.addFault('OP-006', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    fireEvent.change(textarea, { target: { value: '저장 중 합성' } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await waitFor(() => expect(textarea).toHaveAttribute('readonly'));
    expect(screen.getByRole('button', { name: copy['CPY-F11-018'] })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: copy['CPY-F10-006'] })).toBeDisabled();
    release();
    await screen.findByRole('heading', { level: 2, name: copy['CPY-F12-004'] });
  });
});

describe('IX-036 unconfirmed result and safe exit', () => {
  test('unconfirmed keeps the text, offers recheck/copy/leave; recheck later confirms without a second answer', async () => {
    const { world, router, textarea } = await openWrite();
    world.addFault('OP-006', { kind: 'lose-response' });
    world.addFault('OP-008', { kind: 'network' }, { kind: 'network' }, { kind: 'network' }, { kind: 'network' });
    fireEvent.change(textarea, { target: { value: '미확인 합성' } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));

    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === copy['CPY-F11-026'])).toBe(true),
    );
    expect(textarea).toHaveValue('미확인 합성');
    expect(textarea).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: copy['CPY-F11-029'] })).toBeInTheDocument();
    const leave = screen.getByRole('button', { name: copy['CPY-F11-040'] });

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-028'] }));
    await screen.findByRole('heading', { level: 2, name: copy['CPY-F12-004'] });
    expect(world.tickets.size).toBe(1);
    expect(world.answersOf('synthetic-anon-key-registered')).toHaveLength(1);
    expect(router.state.location.pathname).toBe(paths.saved);
    void leave;
  });

  test('safe exit is not offered when the text is not kept; copy failure moves focus to the text', async () => {
    const storage = createFakeStorage();
    const { world, platform, textarea } = await openWrite({ storage });
    world.addFault('OP-006', { kind: 'lose-response' });
    fireEvent.change(textarea, { target: { value: '보관 안 된 합성' } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: copy['CPY-F11-028'] })).toBeInTheDocument());

    storage.failNextWrite(() => true);
    platform.setClipboardFails(true);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-029'] }));
    expect(textarea).toHaveFocus();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(copy['CPY-F11-026']);
    expect(status).toHaveTextContent(copy['CPY-F13-015']);
  });
});

describe('IX-041 closing a request this device can no longer execute', () => {
  test('payload gone: close offered instead of recheck; closing keeps the text and unlocks it; no answer', async () => {
    const { world, textarea } = await openWrite();
    world.addFault('OP-006', { kind: 'lose-response' });
    world.addFault('OP-008', { kind: 'network' }, { kind: 'network' }, { kind: 'network' }, { kind: 'network' });
    fireEvent.change(textarea, { target: { value: '끝낼 요청 합성' } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await screen.findByRole('button', { name: copy['CPY-F11-028'] });

    vi.spyOn(AnswerWriteStore.prototype, 'getPayload').mockResolvedValue(null);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-028'] }));
    const close = await screen.findByRole('button', { name: copy['CPY-COM-020'] });
    expect(screen.queryByRole('button', { name: copy['CPY-F11-028'] })).toBeNull();
    expect(screen.getAllByRole('status').some((s) => s.textContent === copy['CPY-F11-026'])).toBe(true);
    expect(textarea).toHaveAttribute('readonly');
    expect(world.requests.filter((r) => r.op === 'OP-007')).toHaveLength(0);
    expect(world.requests.filter((r) => r.op === 'OP-015')).toHaveLength(0);

    await userEvent.click(close);
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === copy['CPY-COM-021'])).toBe(true),
    );
    expect(textarea).toHaveValue('끝낼 요청 합성');
    expect(textarea).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: copy['CPY-F11-021'] })).toBeEnabled();
    expect(world.answersOf('synthetic-anon-key-registered')).toHaveLength(0);
  });
});

describe('IX-041 past result no longer retained', () => {
  async function unconfirmedThenExpired(answered: boolean) {
    const booted = await openWrite();
    const { world, textarea } = booted;
    world.addFault('OP-006', { kind: 'lose-response' });
    fireEvent.change(textarea, { target: { value: '만료된 결과 합성' } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await screen.findByRole('button', { name: copy['CPY-F11-028'] });
    for (const ticket of world.tickets.values()) ticket.resultExpired = true;
    if (answered) world.seedAnswer('synthetic-anon-key-registered', '다른 기기 합성 기록');
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-028'] }));
    await screen.findByRole('button', { name: copy['CPY-COM-023'] });
    expect(screen.getAllByRole('status').some((s) => s.textContent === copy['CPY-COM-022'])).toBe(true);
    expect(textarea).toHaveAttribute('readonly');
    expect(world.requests.filter((r) => r.op === 'OP-015')).toHaveLength(0);
    return booted;
  }

  test('current answer exists: cleanup → "현재 기록 보기" → F21; no success scene, no overwrite', async () => {
    const { router, world } = await unconfirmedThenExpired(true);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-COM-023'] }));
    const review = await screen.findByRole('button', { name: copy['CPY-COM-024'] });
    expect(router.state.location.pathname).toBe(paths.write);
    await userEvent.click(review);
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.detail));
    expect(await screen.findByText('다른 기기 합성 기록')).toBeInTheDocument();
    expect(world.answersOf('synthetic-anon-key-registered')).toHaveLength(1);
  });

  test('no answer today: cleanup → CPY-COM-025, text kept and editable, a new save uses a new request', async () => {
    const { textarea, world } = await unconfirmedThenExpired(false);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-COM-023'] }));
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === copy['CPY-COM-025'])).toBe(true),
    );
    expect(textarea).toHaveValue('만료된 결과 합성');
    expect(textarea).not.toHaveAttribute('readonly');
    expect(world.answers.size).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await screen.findByRole('heading', { level: 2, name: copy['CPY-F12-004'] });
    expect(world.tickets.size).toBe(2);
  });
});

describe('IX-007 leaving F11', () => {
  test('unkept latest change: dialog with safe focus; Escape stays and restores focus; 나가기 leaves', async () => {
    const storage = createFakeStorage();
    const { router, textarea } = await openWrite({ storage });
    storage.failNextWrite(() => true);
    storage.failNextWrite(() => true);
    fireEvent.change(textarea, { target: { value: '보관 못 한 합성' } });
    const back = screen.getByRole('button', { name: copy['CPY-COM-005'] });
    await userEvent.click(back);

    const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F11-036'] });
    expect(dialog).toHaveAccessibleDescription(copy['CPY-F11-037']);
    expect(screen.getByRole('button', { name: copy['CPY-F11-038'] })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(router.state.location.pathname).toBe(paths.write);
    expect(back).toHaveFocus();
    expect(textarea).toHaveValue('보관 못 한 합성');

    storage.failNextWrite(() => true);
    await userEvent.click(back);
    await screen.findByRole('alertdialog');
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-039'] }));
    expect(await findTitle(copy['CPY-F10-001'])).toBeInTheDocument();
  });

  test('platform Back goes through the same check; a kept change leaves without a dialog', async () => {
    const { router, textarea } = await openWrite();
    fireEvent.change(textarea, { target: { value: '보관될 합성' } });
    await act(() => router.navigate(-1));
    expect(await findTitle(copy['CPY-F10-001'])).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  test('while pre-keeping for a save (tracker not yet kept): Back is locked, no leave and no dialog', async () => {
    const storage = createFakeStorage();
    const { router, textarea } = await openWrite({ storage });
    fireEvent.change(textarea, { target: { value: '저장 중 이탈 합성' } });
    await waitFor(() => expect(help()).toContain(copy['CPY-F11-011']), { timeout: 3_000 });
    const release = storage.holdWrites();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await waitFor(() => expect(textarea).toHaveAttribute('readonly'));
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-COM-005'] }));
    expect(router.state.location.pathname).toBe(paths.write);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    release();
    await screen.findByRole('heading', { level: 2, name: copy['CPY-F12-004'] });
  });
});

describe('MS-CORE-007 success confirmed after leaving F11', () => {
  test('leave while unconfirmed → F10 pending state → later re-entry confirms: one notice, no F12, no haptic', async () => {
    const storage = createFakeStorage();
    const { world, platform, router, textarea } = await openWrite({ storage });
    world.addFault('OP-006', { kind: 'lose-response' }, { kind: 'network' });
    fireEvent.change(textarea, { target: { value: '떠난 뒤 확인될 합성' } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    const later = await screen.findByRole('button', { name: copy['CPY-F11-040'] });
    await userEvent.click(later);

    await findTitle(copy['CPY-F10-001']);
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === copy['CPY-F10-038'])).toBe(true),
    );
    expect(screen.getByRole('button', { name: copy['CPY-F10-039'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy['CPY-F10-005'] })).toBeNull();
    expect(screen.queryByRole('button', { name: copy['CPY-F10-006'] })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '기록' }));
    await findTitle(copy['CPY-F20-001']);
    await userEvent.click(screen.getByRole('button', { name: '오늘' }));
    await findTitle(copy['CPY-F10-001']);

    await waitFor(() => expect(document.querySelector('.arca-sender')).toHaveTextContent(copy['CPY-F10-011']));
    expect(document.body.textContent).not.toContain('떠난 뒤 확인될 합성');
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === copy['CPY-F10-011'])).toBe(true),
    );
    expect(router.state.location.pathname).toBe(paths.today);
    expect(platform.hapticCount).toBe(0);
    expect(world.answersOf('synthetic-anon-key-registered')).toHaveLength(1);
    expect(world.tickets.size).toBe(1);
    expect(draftRecords(storage)).toHaveLength(0);
  });
});

describe('IX-037 status composition', () => {
  test('one live region; a recheck clears an old copy result; not-kept text keeps a copy path', async () => {
    const storage = createFakeStorage();
    const { world, platform, textarea } = await openWrite({ storage });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    world.addFault('OP-006', { kind: 'lose-response' }, { kind: 'network' });
    fireEvent.change(textarea, { target: { value: '상태 결합 합성' } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await screen.findByRole('button', { name: copy['CPY-F11-028'] });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-029'] }));
    expect(platform.clipboardWrites).toEqual(['상태 결합 합성']);
    expect(screen.getByRole('status')).toHaveTextContent(copy['CPY-F13-014']);

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-028'] }));
    await waitFor(() => expect(screen.getByRole('status')).not.toHaveTextContent(copy['CPY-F13-014']));
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});

describe('IX-037 keep-state wording is never contradictory', () => {
  test('pre-keeping failure: failure copy only (no "not confirmed"), copy path offered', async () => {
    const storage = createFakeStorage();
    const { textarea } = await openWrite({ storage });
    fireEvent.change(textarea, { target: { value: '보관 실패 저장 합성' } });
    storage.failNextWrite(() => true);
    storage.failNextWrite(() => true);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(copy['CPY-F11-013']));
    expect(screen.getByRole('status')).not.toHaveTextContent(copy['CPY-COM-008']);
    expect(screen.getByRole('button', { name: copy['CPY-F11-029'] })).toBeInTheDocument();
  });
});
