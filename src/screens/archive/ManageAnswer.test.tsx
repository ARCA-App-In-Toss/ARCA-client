import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { paths } from '../../app/navigation.ts';
import { createFakeStorage, type FakeStorage } from '../../mocks/platform.ts';
import { createMockWorld, type MockAnswer, type MockWorld, SYNTHETIC_KEYS } from '../../mocks/world.ts';
import { bootApp, findTitle, opCount } from '../../test/boot.tsx';
import { copy, rootTabLabels } from '../../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

const updateDrafts = (storage: FakeStorage) =>
  [...storage.data.values()].filter((v) => v.includes('"recordType":"draft"') && v.includes('"kind":"update"'));
const rowTexts = () =>
  screen
    .queryAllByRole('button')
    .filter((b) => b.classList.contains('arca-memory-row'))
    .map((r) => r.querySelector('.arca-memory-row__question')?.textContent);

function seedTwo(world: MockWorld): [MockAnswer, MockAnswer] {
  const older = world.seedAnswer(SYNTHETIC_KEYS.registered, '8월 합성 답변', {
    dailySemaId: 'd-0831',
    createdAt: '2026-08-31T01:00:00Z',
    createdDateKst: '2026-08-31',
    question: { ...world.sema.primaryQuestion, text: '8월 합성 질문' },
  });
  const newer = world.seedAnswer(SYNTHETIC_KEYS.registered, '9월 합성 답변', {
    dailySemaId: 'd-0901',
    createdAt: '2026-09-01T01:00:00Z',
    createdDateKst: '2026-09-01',
    question: { ...world.sema.primaryQuestion, text: '9월 합성 질문' },
  });
  return [older, newer];
}

async function openDetail(world: MockWorld, text: string, storage = createFakeStorage()) {
  const booted = bootApp(server, { world, storage });
  await act(() => booted.started);
  await findTitle(copy['CPY-F10-001']);
  await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
  await findTitle(copy['CPY-F20-001']);
  const question = [...world.answers.values()].find((answer) => answer.content === text)?.question.text;
  expect(question).toBeDefined();
  await waitFor(() => expect(rowTexts()).toContain(question));
  const row = screen
    .getAllByRole('button')
    .find((b) => b.querySelector('.arca-memory-row__question')?.textContent === question);
  await userEvent.click(row as HTMLElement);
  await findTitle(copy['CPY-F21-001']);
  await screen.findByText(text);
  return { ...booted, storage };
}

async function openEdit() {
  await userEvent.click(screen.getByRole('button', { name: copy['CPY-F21-008'] }));
  await findTitle(copy['CPY-F22-001']);
  return (await screen.findByRole('textbox', { name: copy['CPY-F22-003'] })) as HTMLTextAreaElement;
}

describe('F22 edit (03 §6.3, 04 §6.11)', () => {
  test('IME count is live while validation and saving wait for compositionend', async () => {
    const world = createMockWorld('server.activeUnanswered');
    seedTwo(world);
    await openDetail(world, '9월 합성 답변');
    const textarea = await openEdit();
    fireEvent.change(textarea, { target: { value: '가' } });
    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: '가나' } });
    expect(document.getElementById('f22-help')).toHaveTextContent('2/2,000자');
    fireEvent.change(textarea, { target: { value: '가나👩‍👩‍👧' } });
    expect(document.getElementById('f22-help')).toHaveTextContent('3/2,000자');
    fireEvent.change(textarea, { target: { value: '가'.repeat(2_001) } });
    expect(document.getElementById('f22-help')).toHaveTextContent('2,001/2,000자');
    expect(textarea).not.toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(screen.getByRole('button', { name: copy['CPY-F22-014'] }));
    expect(opCount(world, 'OP-007')).toBe(0);
    fireEvent.compositionEnd(textarea, { target: { value: '가'.repeat(2_001) } });
    expect(screen.getByText('1자를 줄여 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy['CPY-F22-014'] })).toBeDisabled();
  });

  test('MS-EDIT-001: exact edit → F21 with the new text, 수정됨, one notice; F20 row patched; no F12', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const [, newer] = seedTwo(world);
    const { storage, router } = await openDetail(world, '9월 합성 답변');
    const textarea = await openEdit();
    expect(textarea.value).toBe('9월 합성 답변');
    const save = screen.getByRole('button', { name: copy['CPY-F22-014'] });
    expect(save).toBeDisabled();

    const edited = '  고친 합성 답변\n\n원문 그대로 👩‍👩‍👧  ';
    fireEvent.change(textarea, { target: { value: edited } });
    await userEvent.click(save);

    await findTitle(copy['CPY-F21-001']);
    expect(router.state.location.pathname).toBe(paths.detail);
    expect(
      screen.getByRole('region', { name: copy['CPY-F21-004'] }).querySelector('.arca-user-text')?.textContent,
    ).toBe(edited);
    expect(screen.getByText(copy['CPY-F21-007'])).toBeInTheDocument();
    expect(await screen.findByText(copy['CPY-F21-014'])).toBeInTheDocument();
    const stored = world.answers.get(newer.answerId);
    expect(stored?.content).toBe(edited);
    expect(stored?.isEdited).toBe(true);
    expect(world.requests.some((r) => r.op === 'OP-006')).toBe(true);
    await waitFor(() => expect(updateDrafts(storage)).toHaveLength(0));
    await waitFor(() => expect(opCount(world, 'OP-009')).toBe(1));

    await userEvent.click(screen.getByRole('button', { name: copy['CPY-COM-005'] }));
    await findTitle(copy['CPY-F20-001']);
    await waitFor(() => expect(rowTexts()[0]).toBe(newer.question.text));
    expect(screen.queryByText(edited)).not.toBeInTheDocument();
    const row = screen.getAllByRole('button').find((b) => b.classList.contains('arca-memory-row'));
    await userEvent.click(row as HTMLElement);
    await findTitle(copy['CPY-F21-001']);
    expect(screen.getByRole('region', { name: copy['CPY-F21-004'] })).toHaveTextContent(edited, {
      normalizeWhitespace: false,
    });
  });

  test('IX-024: back to the server text shows 변경 없음, keeps save disabled and leaves no draft', async () => {
    const world = createMockWorld('server.activeUnanswered');
    seedTwo(world);
    const { storage } = await openDetail(world, '9월 합성 답변');
    const textarea = await openEdit();
    fireEvent.change(textarea, { target: { value: '9월 합성 답변 조금' } });
    await waitFor(() => expect(updateDrafts(storage)).toHaveLength(1), { timeout: 3_000 });
    fireEvent.change(textarea, { target: { value: '9월 합성 답변' } });
    expect(await screen.findByText(copy['CPY-F22-013'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy['CPY-F22-014'] })).toBeDisabled();
    await waitFor(() => expect(updateDrafts(storage)).toHaveLength(0), { timeout: 3_000 });
    expect(screen.getByText(copy['CPY-F22-013'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy['CPY-F22-014'] })).toBeDisabled();
  });

  test('a kept edit draft is restored on re-entry; 수정 내용 버리기 removes only the draft', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const [, newer] = seedTwo(world);
    const { storage } = await openDetail(world, '9월 합성 답변');
    let textarea = await openEdit();
    fireEvent.change(textarea, { target: { value: '임시 수정 합성' } });
    await waitFor(() => expect(updateDrafts(storage)).toHaveLength(1), { timeout: 3_000 });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-COM-005'] }));
    await findTitle(copy['CPY-F21-001']);
    expect(screen.getByText('9월 합성 답변')).toBeInTheDocument();

    textarea = await openEdit();
    expect(textarea.value).toBe('임시 수정 합성');
    expect(screen.getByText(copy['CPY-F22-011'])).toBeInTheDocument();

    const discardTrigger = screen.getByRole('button', { name: copy['CPY-F22-024'] });
    await userEvent.click(discardTrigger);
    let dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F22-025'] });
    expect(within(dialog).getByRole('button', { name: copy['CPY-F22-027'] })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F22-027'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(discardTrigger).toHaveFocus();
    await userEvent.click(discardTrigger);
    dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F22-025'] });
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F22-028'] }));
    await findTitle(copy['CPY-F21-001']);
    expect(screen.getByText('9월 합성 답변')).toBeInTheDocument();
    await waitFor(() => expect(updateDrafts(storage)).toHaveLength(0));
    expect(world.answers.get(newer.answerId)?.content).toBe('9월 합성 답변');
    expect(opCount(world, 'OP-006')).toBe(0);
  });

  test('MS-EDIT-002: another device edited first → not applied, input kept, re-edit on the latest base without mixing', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const [, newer] = seedTwo(world);
    const { storage } = await openDetail(world, '9월 합성 답변');
    const textarea = await openEdit();
    fireEvent.change(textarea, { target: { value: '기기 B 합성' } });
    let release!: () => void;
    world.addFault('OP-007', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F22-014'] }));
    await waitFor(() => expect(opCount(world, 'OP-007')).toBe(1));
    const current = world.answers.get(newer.answerId);
    if (current) {
      current.content = '기기 A 합성';
      current.revision = 'a-r-other';
    }
    release();
    expect(await screen.findByText(copy['CPY-F22-034'])).toBeInTheDocument();
    expect((screen.getByRole('textbox', { name: copy['CPY-F22-003'] }) as HTMLTextAreaElement).value).toBe(
      '기기 B 합성',
    );
    expect(world.answers.get(newer.answerId)?.content).toBe('기기 A 합성');
    expect(screen.queryByRole('button', { name: copy['CPY-F22-017'] })).toBeNull();
    expect(screen.getByRole('button', { name: copy['CPY-F11-029'] })).toBeInTheDocument();

    const reads = opCount(world, 'OP-011');
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F22-035'] }));
    await waitFor(() =>
      expect((screen.getByRole('textbox', { name: copy['CPY-F22-003'] }) as HTMLTextAreaElement).value).toBe(
        '기기 A 합성',
      ),
    );
    expect(opCount(world, 'OP-011')).toBeGreaterThan(reads);
    const stale = await screen.findByRole('region', { name: copy['CPY-F22-036'] });
    expect(within(stale).getByText('기기 B 합성')).toBeInTheDocument();
    expect(screen.queryByText(copy['CPY-F22-034'])).toBeNull();

    await userEvent.click(within(stale).getByRole('button', { name: copy['CPY-F22-038'] }));
    const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F22-025'] });
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F22-038'] }));
    await waitFor(() => expect(screen.queryByRole('region', { name: copy['CPY-F22-036'] })).toBeNull());
    expect(updateDrafts(storage).some((v) => v.includes('기기 B 합성'))).toBe(false);

    const next = screen.getByRole('textbox', { name: copy['CPY-F22-003'] });
    fireEvent.change(next, { target: { value: '기기 A 합성에 덧붙인 합성' } });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F22-014'] }));
    await findTitle(copy['CPY-F21-001']);
    expect(world.answers.get(newer.answerId)?.content).toBe('기기 A 합성에 덧붙인 합성');
  });
});

describe('F22 leaving (04 IX-007, IX-024)', () => {
  test('unchanged text leaves at once; an edit that could not be kept asks before leaving', async () => {
    const world = createMockWorld('server.activeUnanswered');
    seedTwo(world);
    const { storage } = await openDetail(world, '9월 합성 답변');
    await openEdit();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-COM-005'] }));
    await findTitle(copy['CPY-F21-001']);

    const textarea = await openEdit();
    storage.failNextWrite(() => true);
    storage.failNextWrite(() => true);
    storage.failNextWrite(() => true);
    fireEvent.change(textarea, { target: { value: '보관 실패 합성' } });
    await screen.findByText(copy['CPY-F22-012'], { selector: '.arca-field-help span' }, { timeout: 3_000 });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-COM-005'] }));
    const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F11-036'] });
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F11-038'] }));
    expect(await findTitle(copy['CPY-F22-001'])).toBeInTheDocument();
    expect((screen.getByRole('textbox', { name: copy['CPY-F22-003'] }) as HTMLTextAreaElement).value).toBe(
      '보관 실패 합성',
    );
  });
});

describe('F23 single delete (03 §6.4, 04 §6.12, 06 §9.2)', () => {
  test('confirm shows date and question part only; cancel returns focus to the trigger', async () => {
    const world = createMockWorld('server.activeUnanswered');
    seedTwo(world);
    const { router } = await openDetail(world, '9월 합성 답변');
    const trigger = screen.getByRole('button', { name: copy['CPY-F21-009'] });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F23-001'] });
    expect(router.state.location.pathname).toBe(paths.deleteAnswer);
    expect(within(dialog).getByText('2026년 9월 1일에 남긴 기억 조각이에요.')).toBeInTheDocument();
    expect(within(dialog).queryByText('9월 합성 답변')).toBeNull();
    expect(within(dialog).getByText(copy['CPY-F23-005'])).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: copy['CPY-F23-006'] })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F23-006'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(router.state.location.pathname).toBe(paths.detail);
    expect(trigger).toHaveFocus();
    expect(opCount(world, 'OP-012')).toBe(0);
  });

  test('success: nothing removed before terminal; then F20 without the row or its empty month, count re-read', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const [older] = seedTwo(world);
    const storage = createFakeStorage();
    await openDetail(world, '8월 합성 답변', storage);
    let release!: () => void;
    world.addFault('OP-007', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F21-009'] }));
    const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F23-001'] });
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F23-007'] }));
    await waitFor(() => expect(opCount(world, 'OP-007')).toBe(1));
    expect(within(dialog).getByRole('button', { name: copy['CPY-F23-006'] })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(within(dialog).getByText(copy['CPY-F23-008'])).toBeInTheDocument();
    expect(screen.getByText('8월 합성 답변')).toBeInTheDocument();
    release();

    await findTitle(copy['CPY-F20-001']);
    await waitFor(() => expect(rowTexts()).toEqual(['9월 합성 질문']));
    expect(screen.queryByRole('heading', { level: 2, name: '2026년 8월' })).toBeNull();
    expect(world.answers.has(older.answerId)).toBe(false);
    expect(await screen.findByText('기억 조각 1개')).toBeInTheDocument();
    expect(document.querySelector('.arca-visually-hidden[role="status"]')?.textContent).toBe(copy['CPY-F23-009']);
    await waitFor(() => expect(opCount(world, 'OP-009')).toBe(1));
  });

  test('MS-DELETE-002: edited elsewhere after prepare → not deleted, dialog closes, F21 shows the latest text', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const [, newer] = seedTwo(world);
    await openDetail(world, '9월 합성 답변');
    let release!: () => void;
    world.addFault('OP-007', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F21-009'] }));
    const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F23-001'] });
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F23-007'] }));
    await waitFor(() => expect(opCount(world, 'OP-007')).toBe(1));
    const current = world.answers.get(newer.answerId);
    if (current) {
      current.content = '다른 기기가 고친 합성';
      current.revision = 'a-r-other';
    }
    release();
    expect(await screen.findByText(copy['CPY-F21-015'])).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(world.answers.has(newer.answerId)).toBe(true);
    expect(await screen.findByText('다른 기기가 고친 합성')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy['CPY-F21-016'] })).toBeInTheDocument();
  });

  test('MS-DELETE-001: deleted by another device after prepare → ALREADY_ABSENT joins the success', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const [, newer] = seedTwo(world);
    await openDetail(world, '9월 합성 답변');
    let release!: () => void;
    world.addFault('OP-007', { kind: 'hold', release: new Promise<void>((r) => (release = r)) });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F21-009'] }));
    const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F23-001'] });
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F23-007'] }));
    await waitFor(() => expect(opCount(world, 'OP-007')).toBe(1));
    world.answers.delete(newer.answerId);
    release();
    await findTitle(copy['CPY-F20-001']);
    await waitFor(() => expect(rowTexts()).toEqual(['8월 합성 질문']));
    const ticket = [...world.tickets.values()].find((t) => t.answerTarget?.kind === 'DELETE');
    expect(ticket?.deleteEffect).toBe('ALREADY_ABSENT');
  });

  test('unconfirmed delete: check later closes the dialog, F21 keeps tracking; a later check settles it once', async () => {
    const world = createMockWorld('server.activeUnanswered');
    const [, newer] = seedTwo(world);
    const { router } = await openDetail(world, '9월 합성 답변');
    world.addFault('OP-007', { kind: 'lose-response' });
    world.addFault('OP-008', { kind: 'network' }, { kind: 'network' }, { kind: 'network' }, { kind: 'network' });
    const trigger = screen.getByRole('button', { name: copy['CPY-F21-009'] });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F23-001'] });
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F23-007'] }));

    await within(dialog).findByText(copy['CPY-F23-011'], undefined, { timeout: 10_000 });
    expect(within(dialog).getByRole('button', { name: copy['CPY-COM-007'] })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F23-012'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(router.state.location.pathname).toBe(paths.detail);
    expect(screen.getByText('9월 합성 답변')).toBeInTheDocument();
    expect(screen.getByText(copy['CPY-F21-019'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy['CPY-F21-008'] })).toBeDisabled();
    const check = screen.getByRole('button', { name: copy['CPY-F21-020'] });
    expect(check).toHaveFocus();
    expect(world.answers.has(newer.answerId)).toBe(false);

    await userEvent.click(check);
    const again = await screen.findByRole('alertdialog', { name: copy['CPY-F23-001'] });
    await userEvent.click(within(again).getByRole('button', { name: copy['CPY-COM-007'] }));
    await findTitle(copy['CPY-F20-001']);
    await waitFor(() => expect(rowTexts()).toEqual(['8월 합성 질문']));
    expect(opCount(world, 'OP-007')).toBe(1);
  }, 20_000);

  test('delete of an answer with an edit draft removes every edit draft of it', async () => {
    const world = createMockWorld('server.activeUnanswered');
    seedTwo(world);
    const { storage } = await openDetail(world, '9월 합성 답변');
    const textarea = await openEdit();
    fireEvent.change(textarea, { target: { value: '버려질 수정 합성' } });
    await waitFor(() => expect(updateDrafts(storage)).toHaveLength(1), { timeout: 3_000 });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-COM-005'] }));
    await findTitle(copy['CPY-F21-001']);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F21-009'] }));
    const dialog = await screen.findByRole('alertdialog', { name: copy['CPY-F23-001'] });
    await userEvent.click(within(dialog).getByRole('button', { name: copy['CPY-F23-007'] }));
    await findTitle(copy['CPY-F20-001']);
    await waitFor(() => expect(updateDrafts(storage)).toHaveLength(0));
  });
});
