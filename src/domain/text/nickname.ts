import { countGraphemes } from './graphemes.ts';

// Nickname input rules (04 IX-001·IX-002, 05 OP-004): leading/trailing whitespace is removed only at
// submit, then 0 or 2–12 extended grapheme clusters. Line breaks, control and invisible characters are
// rejected; internal spaces, duplicates and emoji are allowed. Input is never truncated.

export const NICKNAME_MIN_GRAPHEMES = 2;
export const NICKNAME_MAX_GRAPHEMES = 12;

export type NicknameError = 'too-short' | 'too-long' | 'forbidden';

export interface NicknameCheck {
  /** Value sent to OP-004: trimmed only, never normalized. */
  normalized: string;
  count: number;
  empty: boolean;
  error: NicknameError | null;
}

const LINE_OR_CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const FORMAT = /\p{Cf}/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;

/**
 * Format characters (ZWJ, tag characters) are part of combined emoji and allowed only inside a
 * pictographic cluster; on their own (zero-width space, joiners, BOM, bidi marks) they are invisible.
 */
function hasForbidden(text: string): boolean {
  if (LINE_OR_CONTROL.test(text)) return true;
  if (!FORMAT.test(text)) return false;
  if (!segmenter) throw new Error('grapheme segmentation unavailable');
  for (const { segment } of segmenter.segment(text)) {
    if (FORMAT.test(segment) && !PICTOGRAPHIC.test(segment)) return true;
  }
  return false;
}

export function checkNickname(raw: string): NicknameCheck {
  const normalized = raw.trim();
  const count = countGraphemes(normalized);
  const empty = count === 0;
  let error: NicknameError | null = null;
  if (hasForbidden(raw)) error = 'forbidden';
  else if (count > NICKNAME_MAX_GRAPHEMES) error = 'too-long';
  else if (!empty && count < NICKNAME_MIN_GRAPHEMES) error = 'too-short';
  return { normalized, count, empty, error };
}
