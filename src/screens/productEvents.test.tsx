import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { paths } from '../app/navigation.ts';
import { mockErrors } from '../mocks/handlers.ts';
import { createMockWorld, type MockWorld, SYNTHETIC_KEYS } from '../mocks/world.ts';
import { bootApp, findTitle } from '../test/boot.tsx';
import { copy, rootTabLabels } from '../ui/copy.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

type Booted = ReturnType<typeof bootApp>;

async function flushed(booted: Booted) {
  await act(() => booted.services.analytics.flush());
  return [...booted.world.productEvents.values()];
}

const namesOf = (events: { name: string }[]) => events.map((e) => e.name);

async function bootToday(world = createMockWorld('server.activeUnanswered')) {
  const booted = bootApp(server, { world });
  await act(() => booted.started);
  await findTitle(copy['CPY-F10-001']);
  return booted;
}

describe('MS-ANALYTICS-001 screens emit allowlisted FE events at their trigger', () => {
  test('F01: onboarding_started once on first display, onboarding_skipped on skip', async () => {
    const booted = bootApp(server, {
      base: 'server.prePassenger',
      key: { kind: 'ok', key: SYNTHETIC_KEYS.unregistered },
    });
    await act(() => booted.started);
    await findTitle(copy['CPY-F01-001']);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F01-006'] }));
    await waitFor(() => expect(booted.router.state.location.pathname).toBe(paths.join));
    const events = await flushed(booted);
    expect(events.map(({ name, properties }) => ({ name, properties }))).toEqual([
      { name: 'onboarding_started', properties: {} },
      { name: 'onboarding_skipped', properties: {} },
    ]);
  });

  test('MS-ONB-003 analytics flush failure does not block skipping to F02', async () => {
    const booted = bootApp(server, {
      base: 'server.prePassenger',
      key: { kind: 'ok', key: SYNTHETIC_KEYS.unregistered },
    });
    booted.world.addFault('OP-014', { kind: 'network' }, mockErrors.maintenance);
    await act(() => booted.started);
    await findTitle(copy['CPY-F01-001']);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F01-006'] }));
    await act(() => booted.services.analytics.flush());
    await waitFor(() => expect(booted.router.state.location.pathname).toBe(paths.join));
    expect(booted.world.productEvents.size).toBe(0);
    expect(booted.services.analytics.pending).toBe(2);
    expect(booted.world.passengers.size).toBe(0);
    booted.services.analytics.discardAll();
  });

  test('F10: today_sema_viewed, then alternate_question_viewed once and each question change', async () => {
    const booted = await bootToday();
    const toggle = () =>
      userEvent.click(
        screen.queryByRole('button', { name: copy['CPY-F10-006'] }) ??
          screen.getByRole('button', { name: copy['CPY-F10-007'] }),
      );
    await toggle();
    await toggle();
    await toggle();
    const events = await flushed(booted);
    expect(events.map(({ name, properties }) => ({ name, properties }))).toEqual([
      { name: 'today_sema_viewed', properties: { answerState: 'UNANSWERED' } },
      { name: 'sema_question_changed', properties: { from: 'PRIMARY', to: 'ALTERNATE' } },
      { name: 'alternate_question_viewed', properties: {} },
      { name: 'sema_question_changed', properties: { from: 'ALTERNATE', to: 'PRIMARY' } },
      { name: 'sema_question_changed', properties: { from: 'PRIMARY', to: 'ALTERNATE' } },
    ]);
  });

  test('F10 answered: today_sema_viewed carries ANSWERED only', async () => {
    const booted = await bootToday(createMockWorld('server.activeAnswered'));
    const events = await flushed(booted);
    expect(events.map(({ name, properties }) => ({ name, properties }))).toEqual([
      { name: 'today_sema_viewed', properties: { answerState: 'ANSWERED' } },
    ]);
  });

  test('F11: answer_started once on the first valid input; unconfirmed save emits answer_save_failed', async () => {
    const booted = await bootToday();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
    await findTitle(copy['CPY-F11-001']);
    const textarea = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
    fireEvent.change(textarea, { target: { value: '합성 첫 입력' } });
    fireEvent.change(textarea, { target: { value: '합성 첫 입력 계속' } });
    await waitFor(() => expect(document.getElementById('f11-help')).toHaveTextContent(copy['CPY-F11-011']), {
      timeout: 3_000,
    });
    booted.world.addFault('OP-006', { kind: 'network' }, { kind: 'network' });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await screen.findByText(copy['CPY-F11-026'], { exact: false });
    const events = (await flushed(booted)).filter((e) => e.name !== 'today_sema_viewed');
    expect(events.map(({ name, properties }) => ({ name, properties }))).toEqual([
      { name: 'answer_started', properties: { mode: 'CREATE' } },
      {
        name: 'answer_save_failed',
        properties: { mode: 'CREATE', certainty: 'UNKNOWN', reasonCode: 'NETWORK_UNCONFIRMED' },
      },
    ]);
  });

  test('F11: a rejected save shows the failure and emits NOT_APPLIED with a closed reason code', async () => {
    const booted = await bootToday();
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
    const textarea = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
    fireEvent.change(textarea, { target: { value: '합성 저장 거절' } });
    await waitFor(() => expect(document.getElementById('f11-help')).toHaveTextContent(copy['CPY-F11-011']), {
      timeout: 3_000,
    });
    booted.world.addFault('OP-006', mockErrors.maintenance);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await screen.findByText(copy['CPY-F11-020'], { exact: false });
    const failed = (await flushed(booted)).filter((e) => e.name === 'answer_save_failed');
    expect(failed.map((e) => e.properties)).toEqual([
      { mode: 'CREATE', certainty: 'NOT_APPLIED', reasonCode: 'SERVER_UNAVAILABLE' },
    ]);
  });

  test('F20 → F22: archive_viewed with the first page state, answer_started UPDATE on first edit', async () => {
    const world = createMockWorld('server.activeAnswered');
    const booted = await bootToday(world);
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
    await findTitle(copy['CPY-F20-001']);
    const row = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('.arca-memory-row');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    await userEvent.click(row);
    await findTitle(copy['CPY-F21-001']);
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F21-008'] }));
    await findTitle(copy['CPY-F22-001']);
    const textarea = await screen.findByRole('textbox', { name: copy['CPY-F22-003'] });
    await waitFor(() => expect(textarea).not.toHaveValue(''));
    fireEvent.change(textarea, { target: { value: '합성 수정 입력' } });
    fireEvent.change(textarea, { target: { value: '합성 수정 입력 둘' } });
    const events = (await flushed(booted)).filter((e) => e.name !== 'today_sema_viewed');
    expect(events.map(({ name, properties }) => ({ name, properties }))).toEqual([
      { name: 'archive_viewed', properties: { state: 'NON_EMPTY' } },
      { name: 'answer_started', properties: { mode: 'UPDATE' } },
    ]);
  });

  test('F20 empty: archive_viewed EMPTY', async () => {
    const booted = await bootToday();
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
    await screen.findByRole('heading', { level: 2, name: copy['CPY-F20-011'] });
    const events = (await flushed(booted)).filter((e) => e.name === 'archive_viewed');
    expect(events.map((e) => e.properties)).toEqual([{ state: 'EMPTY' }]);
  });
});

describe('MS-ANALYTICS-002 flush hints and non-blocking delivery', () => {
  test('app lifecycle and network return flush the queue without reaching 20 events', async () => {
    const booted = await bootToday();
    act(() => booted.platform.setVisible(false));
    await act(() => booted.services.analytics.flush());
    expect(booted.world.productEvents.size).toBe(1);

    act(() => booted.platform.setVisible(true));
    await userEvent.click(screen.getByRole('button', { name: rootTabLabels.archive }));
    await screen.findByRole('heading', { level: 2, name: copy['CPY-F20-011'] });
    booted.platform.setOffline(true);
    act(() => booted.platform.setOffline(false));
    await act(() => booted.services.analytics.flush());
    expect(namesOf([...booted.world.productEvents.values()])).toContain('archive_viewed');
  });
});

describe('MS-PRIVACY-001 product events carry no content, nickname, keys, tokens or internal IDs', () => {
  test('flushed batches from a question → write → save → archive run contain only allowlisted values', async () => {
    const world: MockWorld = createMockWorld('server.activeUnanswered');
    const booted = await bootToday(world);
    const canary = '카나리 답변 PRV7Q3 한 정거장';
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F10-005'] }));
    const textarea = await screen.findByRole('textbox', { name: copy['CPY-F11-003'] });
    fireEvent.change(textarea, { target: { value: canary } });
    await waitFor(() => expect(document.getElementById('f11-help')).toHaveTextContent(copy['CPY-F11-011']), {
      timeout: 3_000,
    });
    await userEvent.click(screen.getByRole('button', { name: copy['CPY-F11-018'] }));
    await screen.findByRole('heading', { level: 2, name: copy['CPY-F12-004'] });
    const events = await flushed(booted);
    expect(events.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(events.map(({ owner: _owner, ...rest }) => rest));
    const answer = [...world.answers.values()][0];
    for (const forbidden of [
      'PRV7Q3',
      SYNTHETIC_KEYS.registered,
      'synthetic-token-',
      'ARC-2417',
      world.sema.dailySemaId,
      world.sema.semaId,
      world.sema.semaCode,
      world.sema.primaryQuestion.questionId,
      world.sema.primaryQuestion.text,
      answer?.answerId ?? 'synthetic-answer-',
      'synthetic-ticket-',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
