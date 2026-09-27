import { useCallback, useEffect, useRef, useState } from 'react';
import type { DraftIdentity } from '../domain/drafts/draftRepository.ts';
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
}

/** One open draft per identity (06 §7). Switching identity flushes nothing by itself; callers flush first. */
export function useDraftSession(identity: DraftIdentity | null): DraftSession {
  const services = useAppServicesInternal();
  const [load, setLoad] = useState<DraftLoad>({ kind: 'loading' });
  const [text, setText] = useState('');
  const [status, setStatus] = useState<KeepStatus>({ kind: 'clean' });
  const writerRef = useRef<DraftWriter | null>(null);
  const key = identity
    ? `${identity.dailySemaId}|${identity.semaId}@${identity.semaVersion}|${identity.questionId}@${identity.questionVersion}`
    : null;

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
        onStatus: (next) => {
          if (active) setStatus(next);
        },
      });
      writerRef.current = writer;
      setText(initialText);
    };
    services.drafts.load(identity).then(
      (draft) => {
        if (!active) return;
        start(draft?.text ?? '', draft?.lastModifiedAt ?? null);
        setLoad({ kind: 'ready', restored: draft !== null && draft.text.length > 0 });
      },
      () => {
        if (!active) return;
        start('', null);
        setLoad({ kind: 'unreadable' });
      },
    );
    return () => {
      active = false;
      writerRef.current?.dispose();
      writerRef.current = null;
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

  return { load, text, status, change, compositionEnd, flush, flushKept };
}
