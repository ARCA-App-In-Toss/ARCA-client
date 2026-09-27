import { expect, type Page, test } from '@playwright/test';

// Browser smoke of F01 → F02 → F03 → F10 on the dev mock with an unregistered synthetic key
// (MS-SES-001-pre, MS-ONB-001/003, MS-NICK-001). Synthetic values only.

async function toBoarding(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'ARCA 이야기' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '탑승 준비' })).toBeFocused();
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('intro → consent → passenger → nickname → first question', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await toBoarding(page);

  await page.getByText('서비스 이용약관에 동의해요').click();
  await page.getByRole('checkbox', { name: '필수, 개인정보처리방침에 동의' }).check();
  await page.getByRole('button', { name: '동의하고 탑승하기' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'ARCA에 탑승했어요' })).toBeFocused();
  await expect(page).toHaveURL(/\/join\/complete$/);
  await page.getByRole('textbox', { name: '닉네임, 선택 입력' }).fill('합성 항해자');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeFocused();
  await expect(page).toHaveURL(/\/today$/);
  // No key, token, code or nickname in the URL.
  expect(page.url()).not.toMatch(/synthetic|token|SYN-|%ED%95%A9/);
  expect(errors).toEqual([]);
});

test('320px with 200% text: intro story and consent screens reflow without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(page.getByRole('heading', { level: 1, name: 'ARCA 이야기' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '전체 이야기 읽기' }).click();
  await noHorizontalScroll(page);

  await page.getByRole('button', { name: '건너뛰기' }).click();
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await noHorizontalScroll(page);
  const board = page.getByRole('button', { name: '동의하고 탑승하기' });
  await board.scrollIntoViewIfNeeded();
  await expect(board).toBeInViewport();
});
