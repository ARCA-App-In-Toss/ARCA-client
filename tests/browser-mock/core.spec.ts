import { expect, type Page, test } from '@playwright/test';

const TEXT = '  브라우저 합성 답변\n\n빈 줄 뒤 👩‍👩‍👧  ';

async function writeAndSave(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '답변 작성하기' }).click();
  const field = page.getByRole('textbox', { name: '내 답변' });
  await field.fill(TEXT);
  await expect(page.getByText('기기에 임시 보관됨')).toBeVisible();
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: '기억 조각으로 저장됐어요.' })).toBeFocused();
}

test('question → write → save → read again in the browser', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await writeAndSave(page);
  await expect(page).toHaveURL(/\/today\/saved$/);
  await expect(page.locator('.arca-user-text')).toHaveCount(0);

  await page.getByRole('button', { name: '항해 기록 보기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '항해 기록' })).toBeVisible();
  await page.locator('.arca-memory-row').first().click();
  await expect(page.getByRole('heading', { level: 1, name: '기억 조각' })).toBeFocused();
  await expect(page.getByRole('region', { name: '내 답변' }).locator('.arca-user-text')).toHaveText(TEXT, {
    useInnerText: false,
  });
  expect(page.url()).not.toMatch(/synthetic|token|answer-/);
  expect(errors).toEqual([]);
});

test('320px with 200% text: no horizontal scroll and the save control stays reachable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '답변 작성하기' }).click();
  await page.getByRole('textbox', { name: '내 답변' }).fill('긴 글 합성\n'.repeat(30));
  const save = page.getByRole('button', { name: '저장하기', exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('Reduced Motion: the same flow completes and the result is shown at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await writeAndSave(page);
  await expect(page.getByRole('button', { name: '오늘의 항해로' })).toBeEnabled();
});

test('MS-CORE-009 fonts and images blocked: question, writing, result and moves never wait on them', async ({
  page,
}) => {
  const blocked: string[] = [];
  await page.route(/\.(woff2?|ttf|otf|png|jpe?g|webp|gif|svg)(\?.*)?$/, (route) => {
    const type = route.request().resourceType();
    if (type !== 'image' && type !== 'font') return route.continue();
    blocked.push(type);
    return route.abort();
  });
  await writeAndSave(page);
  await page.getByRole('button', { name: '오늘의 항해로' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible();
  await expect(page.getByRole('button', { name: '내 기억 조각 보기' })).toBeVisible();
});
