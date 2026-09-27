import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DraftContext, DraftIdentity } from '../domain/drafts/draftRepository.ts';
import { useAppServicesInternal } from './AppServices.tsx';

// F13 and the F10 past-draft Sheet (06 §7.4, 04 IX-034). History state carries only an opaque local
// ref; the draft identity (server ids) and any handed-over text stay in memory and are dropped on an
// owner change (06 §5.1, §5.6).

/** Device-keeping state of the text F11 hands over on a date change (04 §6.6 날짜 변경). */
export type HandoffKeep = 'kept' | 'failed' | 'unsettled';

export interface PastDraftEntry {
  identity: DraftIdentity;
  /** Present only for the F11 date-change handoff: the text on screen and its keeping state. */
  handoff: { text: string; keep: HandoffKeep; context: DraftContext | null } | null;
}

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
  const { draftRefs } = useAppServicesInternal();
  return useMemo(
    () => ({
      /** F11 date change: the screen's text and keeping state go with the ref, not into history. */
      handOff(identity: DraftIdentity, handoff: NonNullable<PastDraftEntry['handoff']>): string {
        const ref = newRef();
        draftRefs.set(ref, { identity, handoff });
        return ref;
      },
    }),
    [draftRefs],
  );
}

/**
 * Unexpired past drafts for the F10 Sheet, read when the Sheet opens (expired ones are removed then,
 * 06 §7.4). Rows without a stored date/question cannot be shown complete and are left out (04 §5.10).
 */
export function usePastDrafts(currentDailySemaId: string | null, open: boolean): PastDraftList {
  const { drafts, draftRefs } = useAppServicesInternal();
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
  /** No entry for the ref (reload, owner change): the screen returns to F10. */
  | { kind: 'missing' }
  | {
      kind: 'ready';
      text: string;
      context: DraftContext | null;
      keep: HandoffKeep;
      /** Only when the exact text is confirmed on the device (04 IX-034). */
      expiresAt: number | null;
    }
  /** Removed after 7 days: the text is never shown again (03 F13 만료). */
  | { kind: 'expired' }
  | { kind: 'unreadable' };

/** Loads the draft behind an opaque ref; loading also removes it if it has expired (06 §7.4). */
export function usePastDraft(ref: string | null): PastDraftView {
  const { drafts, draftRefs } = useAppServicesInternal();
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
      // The screen's text is the latest; the stored copy may be older or missing.
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
