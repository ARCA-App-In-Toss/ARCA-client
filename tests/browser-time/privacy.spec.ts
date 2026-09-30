import { expect, test } from '@playwright/test';
import { CANARY, watchSinks } from '../support/privacy-sinks.ts';

test('MS-PRIVACY-001 date change recovery keeps the canary answer out of forbidden sinks', async ({ page }) => {
  const sinks = await watchSinks(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '답변 작성하기' }).click();
  await page.getByRole('textbox', { name: '내 답변' }).fill(CANARY.answer);
  await expect(page.getByText('기기에 임시 보관됨')).toBeVisible();
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '날짜가 바뀌었어요' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '작성한 내용' })).toHaveValue(CANARY.answer);
  await sinks.checkpoint();

  await page.getByRole('button', { name: '오늘의 항해로' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible();
  await page.getByRole('button', { name: '지난 임시본 보기' }).click();
  await page.getByRole('dialog', { name: '지난 임시본' }).locator('.arca-memory-row').first().click();
  await expect(page.getByRole('heading', { level: 1, name: '지난 임시본' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '작성한 내용' })).toHaveValue(CANARY.answer);
  await sinks.flushAnalytics();
  await sinks.assertClean();
});
