import { useEffect, useState } from 'react';

export const PENDING_REVEAL_MS = 500;

export function usePendingReveal(pending: boolean): boolean {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!pending) {
      setRevealed(false);
      return;
    }
    const timer = window.setTimeout(() => setRevealed(true), PENDING_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return pending && revealed;
}
