import { afterEach, describe, expect, test, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  setClipboardText: vi.fn<(text: string) => Promise<void>>(),
  getNetworkStatus: vi.fn<() => Promise<string>>(),
  generateHapticFeedback: vi.fn<(options: { type: string }) => Promise<void>>(),
}));

vi.mock('@apps-in-toss/web-framework', () => ({
  Device: { openURL: vi.fn() },
  Storage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clearItems: vi.fn() },
  User: { getAnonymousKey: Object.assign(vi.fn(), { isSupported: () => false }) },
  setClipboardText: sdk.setClipboardText,
  getNetworkStatus: sdk.getNetworkStatus,
  generateHapticFeedback: sdk.generateHapticFeedback,
}));

const { createAppsInTossPlatform } = await import('./appsInTossPlatform.ts');

function standardClipboard(writeText: ((text: string) => Promise<void>) | null) {
  const value = writeText ? { writeText: vi.fn(writeText) } : undefined;
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
  return value?.writeText;
}

function onLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

afterEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  onLine(true);
});

describe('MS-PLATFORM-001 clipboard falls back one step at a time', () => {
  test('SDK success: copied, the standard API is not tried', async () => {
    sdk.setClipboardText.mockResolvedValue();
    const standard = standardClipboard(async () => {});
    await expect(createAppsInTossPlatform().clipboard.writeText('합성 복사')).resolves.toEqual({ kind: 'copied' });
    expect(sdk.setClipboardText).toHaveBeenCalledWith('합성 복사');
    expect(standard).not.toHaveBeenCalled();
  });

  test('SDK refused: the standard API copies the same text', async () => {
    sdk.setClipboardText.mockRejectedValue(new Error('synthetic sdk refusal'));
    const standard = standardClipboard(async () => {});
    await expect(createAppsInTossPlatform().clipboard.writeText('  합성\n복사  ')).resolves.toEqual({ kind: 'copied' });
    expect(sdk.setClipboardText).toHaveBeenCalledTimes(1);
    expect(standard).toHaveBeenCalledWith('  합성\n복사  ');
  });

  test.each([
    ['refused', async () => Promise.reject(new Error('synthetic standard refusal'))],
    ['unsupported', null],
  ])('SDK refused and the standard API %s: failed, never a false copy', async (_label, writeText) => {
    sdk.setClipboardText.mockRejectedValue(new Error('synthetic sdk refusal'));
    standardClipboard(writeText);
    await expect(createAppsInTossPlatform().clipboard.writeText('합성 복사')).resolves.toEqual({ kind: 'failed' });
  });
});

describe('MS-PLATFORM-002 missing platform capabilities never throw into the flow', () => {
  test('network status unavailable: falls back to the browser online flag', async () => {
    sdk.getNetworkStatus.mockRejectedValue(new Error('synthetic unsupported'));
    onLine(false);
    await expect(createAppsInTossPlatform().network.isOffline()).resolves.toBe(true);
    onLine(true);
    await expect(createAppsInTossPlatform().network.isOffline()).resolves.toBe(false);
  });

  test('haptics unavailable: the saved feedback resolves quietly', async () => {
    sdk.generateHapticFeedback.mockRejectedValue(new Error('synthetic unsupported'));
    await expect(createAppsInTossPlatform().haptic.memorySaved()).resolves.toBeUndefined();
  });
});
