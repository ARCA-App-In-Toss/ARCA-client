// Display formats from 04 §5.10. Date-only KST values are formatted from their digits; no timezone math.

export function formatDateKst(dateKst: string): string {
  const [year, month, day] = dateKst.split('-').map((part) => Number.parseInt(part, 10));
  return `${year}년 ${month}월 ${day}일`;
}

export function formatCount(count: number): string {
  return new Intl.NumberFormat('ko-KR').format(count);
}

/** True when the stored text has no non-whitespace character (04 §5.10 #5). */
export function isWhitespaceOnly(text: string): boolean {
  return text.length > 0 && text.trim().length === 0;
}
