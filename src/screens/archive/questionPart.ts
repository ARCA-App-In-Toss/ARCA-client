import { prefixExcerpt } from '../../domain/text/graphemes.ts';

export function questionPartOf(text: string) {
  return prefixExcerpt(text, 80, 2);
}
