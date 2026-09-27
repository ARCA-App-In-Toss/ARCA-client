import { expect, type Page, test } from '@playwright/test';

// F30/F31 on the dev mock (08 §3.2 SETTINGS/ALLDEL rows). Synthetic values only; no nickname, id or
// token may reach the URL.

async function openSettings(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '설정' })).toBeVisible();
}

const noSecretsInUrl = (page: Page) => expect(page.url()).not.toMatch(/synthetic|token|합성|SYN-/);

test('F30: nickname edit saves once, closes to its trigger; Back returns to F10', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openSettings(page);
  const trigger = page.getByRole('button', { name: '닉네임 변경하기' });
  await trigger.click();
  const field = page.getByRole('textbox', { name: '닉네임' });
  await expect(field).toBeFocused();
  await field.fill('합성 이름');
  await page.getByRole('button', { name: '닉네임 저장하기' }).click();
  await expect(page.getByText('닉네임을 변경했어요.')).toBeVisible();
  await expect(page.getByRole('button', { name: '닉네임 변경하기' })).toBeFocused();
  await noSecretsInUrl(page);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('F31: two-step confirmation with safe initial focus; success lands on F01 and Back cannot reopen old screens', async ({
  page,
}) => {
  await openSettings(page);
  await page.getByRole('button', { name: '모든 데이터 삭제' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '모든 데이터 삭제' })).toBeVisible();
  await expect(page.getByText('가명 처리된 동의 주체 식별값')).toBeVisible();
  await page.getByRole('button', { name: '삭제 계속하기' }).click();
  const dialog = page.getByRole('alertdialog', { name: '정말 모든 데이터를 삭제할까요?' });
  await expect(dialog.getByRole('button', { name: '취소' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '삭제 계속하기' })).toBeFocused();

  await page.getByRole('button', { name: '삭제 계속하기' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '모든 데이터 삭제' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'ARCA 이야기' })).toBeVisible({ timeout: 15_000 });
  await noSecretsInUrl(page);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'ARCA 이야기' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: '설정' })).toHaveCount(0);
});

test('320px with 200% text: F30 and F31 controls stay reachable, no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = '200%';
    });
  });
  await openSettings(page);
  await page.getByRole('button', { name: '닉네임 변경하기' }).click();
  for (const name of ['닉네임 저장하기', '취소', '모든 데이터 삭제']) {
    const button = page.getByRole('button', { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: '모든 데이터 삭제', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '모든 데이터 삭제' })).toBeVisible();
  for (const name of ['취소', '삭제 계속하기']) {
    const button = page.getByRole('button', { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: '삭제 계속하기' }).click();
  const dialog = page.getByRole('alertdialog');
  for (const name of ['취소', '모든 데이터 삭제']) {
    const button = dialog.getByRole('button', { name, exact: true });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
  }
});
