import { expect, type Page, test } from '@playwright/test';

// MS-LIST-003/004 and F21~F23 on the dev mock (08 §3.2 LIST/EDIT/DELETE rows). Synthetic text only;
// no ids, content or tokens may reach the URL.

async function openArchive(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '기록', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '항해 기록' })).toBeVisible();
  await expect(page.locator('.arca-memory-row')).toHaveCount(20);
}

/** Every tappable element must suppress the native tap overlay (no grey flash on touch). */
async function expectNoTapHighlight(page: Page) {
  const offenders = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('button, a, label, input, [role="button"], .arca-intro-stage'))
      .filter((element) => {
        const color = getComputedStyle(element).getPropertyValue('-webkit-tap-highlight-color').replace(/\s/g, '');
        return color !== '' && color !== 'transparent' && color !== 'rgba(0,0,0,0)';
      })
      .map((element) => element.outerHTML.slice(0, 80)),
  );
  expect(offenders).toEqual([]);
}

const noIdsInUrl = (page: Page) => expect(page.url()).not.toMatch(/synthetic|token|합성|answer-/);

test('20 + 1 on request, one heading per month, F21 → Back restores the chain and the row', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openArchive(page);
  await expect(page.getByText('모든 기록을 불러왔어요.')).toHaveCount(0);
  await page.getByRole('button', { name: '기록 더 보기' }).click();
  await expect(page.locator('.arca-memory-row')).toHaveCount(21);
  await expect(page.getByText('모든 기록을 불러왔어요.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['2026년 9월', '2026년 8월']);

  const last = page.locator('.arca-memory-row').last();
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await expect(page.getByRole('heading', { level: 1, name: '기억 조각' })).toBeVisible();
  await noIdsInUrl(page);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: '항해 기록' })).toBeVisible();
  await expect(page.locator('.arca-memory-row')).toHaveCount(21);
  await expect(page.locator('.arca-memory-row').last()).toBeInViewport();
  expect(errors).toEqual([]);
});

test('edit: exact text saved, F21 shows it with 수정됨; no F12', async ({ page }) => {
  await openArchive(page);
  await page.locator('.arca-memory-row').first().click();
  await page.getByRole('button', { name: '수정하기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '기억 조각 수정' })).toBeVisible();
  const field = page.getByRole('textbox', { name: '내 답변' });
  await expect(field).toHaveValue('역 뒤편 공원의 세 번째 벤치에서 한 정거장을 걸을지 고민했다. (1)');
  const edited = '브라우저에서 고친 합성\n둘째 줄  ';
  await field.fill(edited);
  await page.getByRole('button', { name: '수정 내용 저장' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '기억 조각' })).toBeVisible();
  await expect(page.getByText('수정한 내용을 저장했어요.')).toBeVisible();
  await expect(page.getByText('수정됨')).toBeVisible();
  await expect(page.locator('.arca-record-panel .arca-user-text')).toHaveText(edited, { useInnerText: false });
  await noIdsInUrl(page);
});

test('delete: Escape cancels with focus back; confirm removes the row and returns to F20', async ({ page }) => {
  await openArchive(page);
  const deletedDate = await page.locator('.arca-memory-row__meta').first().innerText();
  await page.locator('.arca-memory-row').first().click();
  const trigger = page.getByRole('button', { name: '삭제하기' });
  await trigger.click();
  const dialog = page.getByRole('alertdialog', { name: '이 기억 조각을 삭제할까요?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '취소' })).toBeFocused();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole('alertdialog').getByRole('button', { name: '기억 조각 삭제' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '항해 기록' })).toBeVisible();
  // The row goes at once; at the top the re-read first page then replaces the chain (06 §6.3–6.4).
  await expect(page.getByText(deletedDate, { exact: true })).toHaveCount(0);
  await expect(page.locator('.arca-memory-row')).toHaveCount(20);
  await expect(page.getByText('기억 조각 20개')).toBeVisible();
  await expect(page.getByRole('button', { name: '기록 더 보기' })).toHaveCount(0);
  await noIdsInUrl(page);
});

test('320px with 200% text: F21 actions and the F23 dialog stay reachable, no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = '200%';
    });
  });
  await openArchive(page);
  await page.locator('.arca-memory-row').first().click();
  for (const name of ['수정하기', '삭제하기']) {
    const button = page.getByRole('button', { name });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
  }
  await page.getByRole('button', { name: '삭제하기' }).click();
  const dialog = page.getByRole('alertdialog');
  for (const name of ['취소', '기억 조각 삭제']) {
    const button = dialog.getByRole('button', { name });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // F22 layout: question context, field and save stay in the document flow and reachable.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '수정하기' }).click();
  await page.getByRole('textbox', { name: '내 답변' }).fill('좁은 화면 합성');
  for (const name of ['수정 내용 저장', '수정 내용 버리기']) {
    const button = page.getByRole('button', { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
  }
  const editOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(editOverflow).toBeLessThanOrEqual(0);
});

test('scroll: a forward move opens the next screen at its top; the in-app back restores the F20 row', async ({
  page,
}) => {
  await openArchive(page);
  // Make every screen taller than the viewport so a leftover scroll position could survive.
  await page.addStyleTag({ content: '.arca-shell { min-height: 400vh; }' });
  const row = page.locator('.arca-memory-row').nth(15);
  await row.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await row.click();
  await expect(page.getByRole('heading', { level: 1, name: '기억 조각' })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.getByRole('button', { name: '이전 화면으로' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '항해 기록' })).toBeVisible();
  await expect(page.locator('.arca-memory-row').nth(15)).toBeInViewport();
});

test('no native tap highlight on F10, F20, F21 and F30 controls', async ({ page }) => {
  await openArchive(page);
  await expectNoTapHighlight(page);
  await page.locator('.arca-memory-row').first().click();
  await expect(page.getByRole('heading', { level: 1, name: '기억 조각' })).toBeVisible();
  await expectNoTapHighlight(page);
  await page.getByRole('button', { name: '이전 화면으로' }).click();
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible();
  await expectNoTapHighlight(page);
  await page.getByRole('button', { name: '설정' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '설정' })).toBeVisible();
  await expectNoTapHighlight(page);
});
