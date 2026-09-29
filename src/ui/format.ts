export function formatDateKst(dateKst: string): string {
  const [year, month, day] = dateKst.split('-').map((part) => Number.parseInt(part, 10));
  return `${year}년 ${month}월 ${day}일`;
}

export function formatCount(count: number): string {
  return new Intl.NumberFormat('ko-KR').format(count);
}

export function isWhitespaceOnly(text: string): boolean {
  return text.length > 0 && text.trim().length === 0;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

export function formatInstantKst(epochMs: number): string {
  const kst = new Date(epochMs + KST_OFFSET_MS);
  const hours = kst.getUTCHours();
  const period = hours < 12 ? '오전' : '오후';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${period} ${hour12}:${minutes} (KST)`;
}
