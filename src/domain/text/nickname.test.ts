import { describe, expect, test } from 'vitest';
import { checkNickname } from './nickname.ts';

describe('checkNickname (IX-001·IX-002, MS-NICK-001)', () => {
  test.each([
    ['', null, 0],
    ['   ', null, 0],
    ['가', 'too-short', 1],
    ['가나', null, 2],
    ['가나다라마바사아자차카타', null, 12],
    ['가나다라마바사아자차카타파', 'too-long', 13],
    ['  가나  ', null, 2],
    ['가 나', null, 3],
  ])('%j → %s (%i EGC)', (raw, error, count) => {
    const result = checkNickname(raw);
    expect(result.error).toBe(error);
    expect(result.count).toBe(count);
  });

  test('a combined emoji counts as one and its joiners are allowed', () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
    expect(checkNickname(`${family}a`)).toMatchObject({ count: 2, error: null });
  });

  test.each([
    ['line break', '가\n나'],
    ['control', '가\u0007나'],
    ['zero-width space', '가​나'],
    ['lone joiner', '가‍나'],
    ['bidi mark', '가‮나'],
  ])('%s is forbidden', (_name, raw) => {
    expect(checkNickname(raw).error).toBe('forbidden');
  });

  test('trim is the only change to the sent value', () => {
    expect(checkNickname('  Ｊoy ').normalized).toBe('Ｊoy');
  });
});
