const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const KST_BOUNDARY_SLACK_MS = 2_000;

export function msUntilKstBoundary(now: number): number {
  const nextMidnightUtc = Math.floor((now + KST_OFFSET_MS) / DAY_MS + 1) * DAY_MS - KST_OFFSET_MS;
  return nextMidnightUtc - now + KST_BOUNDARY_SLACK_MS;
}
