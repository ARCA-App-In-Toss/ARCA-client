import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type DraftContext, type DraftIdentity, draftName } from '../domain/drafts/draftRepository.ts';
import { DraftWriter, type KeepStatus } from '../domain/drafts/draftWriter.ts';
import { useAppServicesInternal } from './AppServices.tsx';

export type DraftLoad =
  | { kind: 'loading' }
  | { kind: 'ready'; restored: boolean }
  /** Stored record unreadable; the screen keeps what the user types and says it is not kept. */
  | { kind: 'unreadable' };

export interface DraftSession {
  load: DraftLoad;
  text: string;
  status: KeepStatus;
  change(text: string, composing: boolean): void;
  compositionEnd(text: string): void;
  /** Writes the latest text now; true only when it is confirmed in Storage. */
  flush(): Promise<boolean>;
  /** Flush, then the confirmed text and last-edit time; null when not kept. */
  flushKept(): Promise<{ text: string; lastModifiedAt: number } | null>;
  /**
   * Removes this identity's kept draft (F22 "수정 내용 버리기", or an edit back to the server text) and
   * continues from `text` with nothing kept. True only when the removal was confirmed.
   */
  discard(text: string): Promise<boolean>;
}

/**
 * One open draft per identity (06 §7). Switching identity flushes nothing by itself; callers flush first.
 * `fallbackText` is the starting text when nothing is kept (F22: the server's current answer).
 */
export function useDraftSession(
  identity: DraftIdentity | null,
  context?: DraftContext,
  fallbackText = '',
): DraftSession {
  const services = useAppServicesInternal();
  // Latest date/question for the record value; it never changes which draft is open.
  const contextRef = useRef(context);
  contextRef.current = context;
  const [load, setLoad] = useState<DraftLoad>({ kind: 'loading' });
  const [text, setText] = useState('');
  const [status, setStatus] = useState<KeepStatus>({ kind: 'clean' });
  const writerRef = useRef<DraftWriter | null>(null);
  const fallbackRef = useRef(fallbackText);
  fallbackRef.current = fallbackText;
  const startRef = useRef<((initialText: string, lastModifiedAt: number | null) => void) | null>(null);
  const key = identity ? draftName(identity) : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` fully identifies `identity`.
  useEffect(() => {
    if (!identity) return;
    let active = true;
    setLoad({ kind: 'loading' });
    setStatus({ kind: 'clean' });
    const start = (initialText: string, lastModifiedAt: number | null) => {
      const writer = new DraftWriter({
        repository: services.drafts,
        identity,
        initialText,
        initialLastModifiedAt: lastModifiedAt,
        ...(contextRef.current ? { context: contextRef.current } : {}),
        onStatus: (next) => {
          if (active) setStatus(next);
        },
      });
      writerRef.current = writer;
      setText(initialText);
    };
    startRef.current = start;
    services.drafts.load(identity).then(
      (draft) => {
        if (!active) return;
        start(draft?.text ?? fallbackRef.current, draft?.lastModifiedAt ?? null);
        setLoad({ kind: 'ready', restored: draft !== null && draft.text.length > 0 });
      },
      () => {
        if (!active) return;
        start(fallbackRef.current, null);
        setLoad({ kind: 'unreadable' });
      },
    );
    return () => {
      active = false;
      writerRef.current?.dispose();
      writerRef.current = null;
      startRef.current = null;
    };
  }, [key, services.drafts]);

  const change = useCallback((next: string, composing: boolean) => {
    setText(next);
    writerRef.current?.change(next, composing);
  }, []);

  const compositionEnd = useCallback((next: string) => {
    setText(next);
    writerRef.current?.compositionEnd(next);
  }, []);

  // No open writer means nothing was edited in this session: there is nothing left to keep.
  const flush = useCallback(async () => (writerRef.current ? writerRef.current.flush() : true), []);

  const flushKept = useCallback(async () => {
    const writer = writerRef.current;
    return writer ? writer.flushKept() : null;
  }, []);

  const identityRef = useRef(identity);
  identityRef.current = identity;
  const discard = useCallback(
    async (next: string) => {
      const current = identityRef.current;
      if (!current) return true;
      writerRef.current?.dispose();
      writerRef.current = null;
      let removed = true;
      try {
        await services.drafts.remove(current);
      } catch {
        removed = false;
      }
      // Continue with a fresh writer: nothing is kept until the next edit.
      startRef.current?.(next, null);
      setStatus({ kind: 'clean' });
      return removed;
    },
    [services.drafts],
  );

  return { load, text, status, change, compositionEnd, flush, flushKept, discard };
}

export interface StaleEditDraft {
  text: string;
  remove(): Promise<boolean>;
}

/**
 * The latest edit draft of this answer kept on another base revision (06 §7.1): shown read-only for
 * copy/discard, never applied to the current edit. Null when there is none (or it cannot be read).
 */
export function useStaleEditDraft(answerId: string, currentRevision: string): StaleEditDraft | null {
  const services = useAppServicesInternal();
  const [found, setFound] = useState<{ identity: DraftIdentity; text: string } | null>(null);
  const [version, setVersion] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` re-reads after a removal.
  useEffect(() => {
    let active = true;
    services.drafts.listUpdateDrafts(answerId).then(
      (drafts) => {
        if (!active) return;
        const stale = drafts.find((d) => d.identity.kind === 'update' && d.identity.baseRevision !== currentRevision);
        setFound(stale ? { identity: stale.identity, text: stale.text } : null);
      },
      () => {
        if (active) setFound(null);
      },
    );
    return () => {
      active = false;
    };
  }, [services.drafts, answerId, currentRevision, version]);

  return useMemo(() => {
    if (!found) return null;
    return {
      text: found.text,
      remove: async () => {
        try {
          await services.drafts.remove(found.identity);
          return true;
        } catch {
          return false;
        } finally {
          setVersion((v) => v + 1);
        }
      },
    };
  }, [found, services.drafts]);
}
