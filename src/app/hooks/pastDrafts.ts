import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DraftContext, DraftIdentity } from '../../domain/drafts/draftRepository.ts';
import type { HandoffKeep, PastDraftEntry } from '../../domain/drafts/pastDraftEntry.ts';

export type { HandoffKeep } from '../../domain/drafts/pastDraftEntry.ts';

import { useAppServices } from '../services.tsx';

export interface PastDraftRow {
  ref: string;
  context: DraftContext;
  expiresAt: number;
}

export type PastDraftList = { kind: 'loading' } | { kind: 'ready'; rows: PastDraftRow[] } | { kind: 'failed' };

let refSeq = 0;
function newRef(): string {
  refSeq += 1;
  return globalThis.crypto?.randomUUID?.() ?? `draft-ref-${refSeq}-${Math.random().toString(36).slice(2)}`;
}

export function usePastDraftRefs() {
  const { draftRefs } = useAppServices();
  return useMemo(
    () => ({
      handOff(identity: DraftIdentity, handoff: NonNullable<PastDraftEntry['handoff']>): string {
        const ref = newRef();
        draftRefs.set(ref, { identity, handoff });
        return ref;
      },
    }),
    [draftRefs],
  );
}

export function usePastDrafts(currentDailySemaId: string | null, open: boolean): PastDraftList {
  const { drafts, draftRefs } = useAppServices();
  const [list, setList] = useState<PastDraftList>({ kind: 'loading' });
  useEffect(() => {
    if (!open) return;
    let active = true;
    setList({ kind: 'loading' });
    drafts.listPast(currentDailySemaId).then(
      (found) => {
        if (!active) return;
        const rows: PastDraftRow[] = [];
        for (const item of found) {
          if (!item.context) continue;
          const ref = newRef();
          draftRefs.set(ref, { identity: item.identity, handoff: null });
          rows.push({ ref, context: item.context, expiresAt: item.expiresAt });
        }
        setList({ kind: 'ready', rows });
      },
      () => {
        if (active) setList({ kind: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [drafts, draftRefs, currentDailySemaId, open]);
  return list;
}

export type PastDraftView =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | {
      kind: 'ready';
      text: string;
      context: DraftContext | null;
      keep: HandoffKeep;
      expiresAt: number | null;
    }
  | { kind: 'expired' }
  | { kind: 'unreadable' };

export function usePastDraft(ref: string | null): PastDraftView {
  const { drafts, draftRefs } = useAppServices();
  const [view, setView] = useState<PastDraftView>({ kind: 'loading' });
  const entry = ref ? (draftRefs.get(ref) ?? null) : null;
  const load = useCallback(async (): Promise<PastDraftView> => {
    if (!entry) return { kind: 'missing' };
    const { handoff } = entry;
    let stored: Awaited<ReturnType<typeof drafts.load>>;
    try {
      stored = await drafts.load(entry.identity);
    } catch {
      return handoff
        ? { kind: 'ready', text: handoff.text, context: handoff.context, keep: 'failed', expiresAt: null }
        : { kind: 'unreadable' };
    }
    if (handoff && handoff.keep !== 'kept') {
      return { kind: 'ready', text: handoff.text, context: handoff.context, keep: handoff.keep, expiresAt: null };
    }
    if (!stored) return { kind: 'expired' };
    return {
      kind: 'ready',
      text: stored.text,
      context: stored.context ?? handoff?.context ?? null,
      keep: 'kept',
      expiresAt: stored.expiresAt,
    };
  }, [drafts, entry]);
  useEffect(() => {
    let active = true;
    setView({ kind: 'loading' });
    void load().then((next) => {
      if (active) setView(next);
    });
    return () => {
      active = false;
    };
  }, [load]);
  return view;
}
