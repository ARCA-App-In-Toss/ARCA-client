import { useEffect, useMemo, useRef } from 'react';
import type { AnswerMode, QuestionSlot } from '../../domain/analytics/productEvent.ts';
import { saveFailureOf } from '../../domain/analytics/saveFailure.ts';
import type { ArchiveView } from '../../domain/archive/archiveChains.ts';
import type { WriteView } from '../../domain/commands/answerWriteCoordinator.ts';
import type { Today, TodaySema } from '../../domain/models.ts';
import { measureAnswer } from '../../domain/text/graphemes.ts';
import { useAppServices } from '../services.tsx';

const reportedFailures = new WeakSet<WriteView>();

export function useProductEvents() {
  const { analytics } = useAppServices();
  return useMemo(
    () => ({
      onboardingSkipped: () => void analytics.record({ name: 'onboarding_skipped', properties: {} }),
      semaQuestionChanged: (from: QuestionSlot, to: QuestionSlot) =>
        void analytics.record({ name: 'sema_question_changed', properties: { from, to } }),
    }),
    [analytics],
  );
}

export function useOnboardingStartedEvent() {
  const { analytics } = useAppServices();
  useEffect(() => {
    analytics.recordOnce('onboarding_started', { name: 'onboarding_started', properties: {} });
  }, [analytics]);
}

export function useTodaySemaViewedEvent(today: Today | undefined) {
  const { analytics } = useAppServices();
  const shown = useRef<string | null>(null);
  const answerState = today?.answer.state ?? null;
  const key = today && answerState ? `${today.sema.dailySemaId}:${answerState}` : null;
  useEffect(() => {
    if (!key || !answerState || shown.current === key) return;
    shown.current = key;
    analytics.record({ name: 'today_sema_viewed', properties: { answerState } });
  }, [analytics, key, answerState]);
}

export function useAlternateQuestionViewedEvent(sema: TodaySema | null, shown: boolean) {
  const { analytics } = useAppServices();
  const key = sema ? `alternate:${sema.dailySemaId}:${sema.semaId}:${sema.version}` : null;
  useEffect(() => {
    if (!shown || !key) return;
    analytics.recordOnce(key, { name: 'alternate_question_viewed', properties: {} });
  }, [analytics, key, shown]);
}

export function useAnswerStartedEvent(mode: AnswerMode, input: { ready: boolean; text: string; composing: boolean }) {
  const { analytics } = useAppServices();
  const baseline = useRef<string | null>(null);
  const started = useRef(false);
  const { ready, text, composing } = input;
  useEffect(() => {
    if (started.current) return;
    if (!ready) {
      baseline.current = null;
      return;
    }
    if (baseline.current === null) {
      baseline.current = text;
      return;
    }
    if (composing || text === baseline.current || !measureAnswer(text).savable) return;
    started.current = true;
    analytics.record({ name: 'answer_started', properties: { mode } });
  }, [analytics, mode, ready, text, composing]);
}

export function useAnswerSaveFailedEvent(mode: AnswerMode, view: WriteView) {
  const { analytics } = useAppServices();
  useEffect(() => {
    const failure = saveFailureOf(view);
    if (!failure || reportedFailures.has(view)) return;
    reportedFailures.add(view);
    analytics.record({ name: 'answer_save_failed', properties: { mode, ...failure } });
  }, [analytics, mode, view]);
}

export function useArchiveViewedEvent(view: ArchiveView) {
  const { analytics } = useAppServices();
  const shown = useRef(false);
  const state = view.phase === 'ready' ? (view.items.length === 0 ? 'EMPTY' : 'NON_EMPTY') : null;
  useEffect(() => {
    if (!state || shown.current) return;
    shown.current = true;
    analytics.record({ name: 'archive_viewed', properties: { state } });
  }, [analytics, state]);
}
