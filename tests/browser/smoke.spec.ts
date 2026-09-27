import { expect, test } from '@playwright/test';

// Production bundle in a plain browser: no Toss bridge (no anonymous key) and no API host.
// Start must end on F90 without inventing an identity, calling any API or writing local data.
test('production start without platform identity lands on F90 and sends no API request', async ({ page }) => {
  const errors: string[] = [];
  const apiRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/v1/')) apiRequests.push(request.method());
  });

  await page.goto('/today');

  const title = page.getByRole('heading', { level: 1, name: 'ARCA를 시작하지 못했어요' });
  await expect(title).toBeVisible({ timeout: 15_000 });
  await expect(title).toBeFocused();
  await expect(page).toHaveURL(/\/error\/start$/);
  await expect(page.getByRole('button', { name: '다시 연결하기' })).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('F90 reflows at 320px without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
