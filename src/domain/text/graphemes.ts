// Extended grapheme cluster counting (04 IX-001, 06 §7.2). One logical line break counts as one.
// There is no code-point fallback: if Intl.Segmenter is missing the capability is reported so a
// standards-compatible library can be pinned (06 §14) instead of silently miscounting.

export const ANSWER_MAX_GRAPHEMES = 2_000;

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;

export function isGraphemeCountingSupported(): boolean {
  return segmenter !== null;
}

export function countGraphemes(text: string): number {
  if (!segmenter) throw new Error('grapheme segmentation unavailable');
  let count = 0;
  for (const _segment of segmenter.segment(text)) count += 1;
  return count;
}

export interface AnswerLength {
  count: number;
  /** 0 when within the limit. */
  overCount: number;
  /** 1–2,000 EGC; whitespace-only text is valid (05 OP-007). */
  savable: boolean;
}

export function measureAnswer(text: string): AnswerLength {
  const count = countGraphemes(text);
  const overCount = Math.max(0, count - ANSWER_MAX_GRAPHEMES);
  return { count, overCount, savable: count >= 1 && overCount === 0 };
}

/**
 * Longest prefix within an EGC and logical-line budget (04 §5.10). No trim or normalization; the
 * caller adds the visual ellipsis only when `isTruncated`.
 */
export function prefixExcerpt(text: string, maxGraphemes: number, maxLogicalLines: number) {
  if (!segmenter) throw new Error('grapheme segmentation unavailable');
  let out = '';
  let count = 0;
  let lines = 1;
  for (const { segment } of segmenter.segment(text)) {
    const isBreak = segment === '\n' || segment === '\r\n' || segment === '\r';
    if (count + 1 > maxGraphemes || (isBreak && lines + 1 > maxLogicalLines)) break;
    out += segment;
    count += 1;
    if (isBreak) lines += 1;
  }
  return { text: out, isTruncated: out.length < text.length };
}
