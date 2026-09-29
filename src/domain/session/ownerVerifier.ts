export interface LocalOwnerVerifier {
  salt: string;
  value: string;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function subtle(): SubtleCrypto | null {
  return globalThis.crypto?.subtle ?? null;
}

export async function digestOwner(salt: string, anonymousKey: string): Promise<string | null> {
  const crypto = subtle();
  if (!crypto) return null;
  const data = new TextEncoder().encode(`${salt}${anonymousKey}`);
  return hex(await crypto.digest('SHA-256', data));
}

export function newSalt(): string | null {
  if (!globalThis.crypto?.getRandomValues) return null;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return hex(bytes.buffer);
}
