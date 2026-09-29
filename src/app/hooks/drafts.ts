import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type DraftContext, type DraftIdentity, draftName } from '../../domain/drafts/draftRepository.ts';
import { DraftWriter, type KeepStatus } from '../../domain/drafts/draftWriter.ts';
import { useAppServices } from '../services.tsx';

export type DraftLoad = { kind: 'loading' } | { kind: 'ready'; restored: boolean } | { kind: 'unreadable' };

export interface DraftSession {
  load: DraftLoad;
  text: string;
  status: KeepStatus;
  change(text: string, composing: boolean): void;
  compositionEnd(text: string): void;
  flush(): Promise<boolean>;
  flushKept(): Promise<{ text: string; lastModifiedAt: number } | null>;
  discard(text: string): Promise<boolean>;
}

export function useDraftSession(
  identity: DraftIdentity | null,
  context?: DraftContext,
  fallbackText = '',
): DraftSession {
  const services = useAppServices();
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key`가 `identity`를 완전히 식별한다.
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

export function useStaleEditDraft(answerId: string, currentRevision: string): StaleEditDraft | null {
  const services = useAppServices();
  const [found, setFound] = useState<{ identity: DraftIdentity; text: string } | null>(null);
  const [version, setVersion] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version`은 삭제 뒤 다시 읽기 위한 값이다.
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
