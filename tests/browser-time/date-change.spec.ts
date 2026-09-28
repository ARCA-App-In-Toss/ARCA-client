import { expect, type Page, test } from '@playwright/test';

// MS-TIME-002 on the dev mock: the server day moves on before the first save (07, 08 §3.2 TIME row).
// Synthetic text only; no ids, content or tokens may reach the URL.
const TEXT = '자정 넘긴 브라우저 합성\n둘째 줄  ';

async function saveAcrossMidnight(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '답변 쓰기' }).click();
  await page.getByRole('textbox', { name: '내 답변' }).fill(TEXT);
  await expect(page.getByText('기기에 임시 보관됨')).toBeVisible();
  await page.getByRole('button', { name: '기억 조각으로 저장' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '날짜가 바뀌었어요' })).toBeVisible();
}

test('date change → F13 (copy first) → today → past-draft Sheet → F13 review', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await saveAcrossMidnight(page);
  const text = page.getByRole('textbox', { name: '작성한 내용' });
  await expect(text).toHaveValue(TEXT);
  await expect(text).toHaveAttribute('readonly', '');
  await expect(page.getByText(/까지 볼 수 있어요\./)).toBeVisible();
  expect(page.url()).not.toMatch(/synthetic|token|자정/);

  await page.getByRole('button', { name: '오늘의 항해로' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible();
  await expect(page.getByText('요즘 자꾸 미루게 되는 일이 있다면, 그 일의 어떤 부분이 무거운가요?')).toBeVisible();

  const trigger = page.getByRole('button', { name: '지난 임시본 보기' });
  await trigger.click();
  const sheet = page.getByRole('dialog', { name: '지난 임시본' });
  await expect(sheet).toBeVisible();
  // Modal: focus stays inside; an outside tap does not close it; Escape does and focus returns.
  await page.mouse.click(5, 5);
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole('dialog', { name: '지난 임시본' }).locator('.arca-memory-row').first().click();
  await expect(page.getByRole('heading', { level: 1, name: '지난 임시본' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '작성한 내용' })).toHaveValue(TEXT);
  expect(errors).toEqual([]);
});

test('F13 at 320px with 200% text: no horizontal scroll, copy and today reachable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = '200%';
    });
  });
  await saveAcrossMidnight(page);
  for (const name of ['복사하기', '오늘의 항해로']) {
    const button = page.getByRole('button', { name });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
