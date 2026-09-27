import { expect, test } from '@playwright/test';

test('production bundle mounts the app root without page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page.getByTestId('app-root')).toBeAttached();
  expect(errors).toEqual([]);
});
