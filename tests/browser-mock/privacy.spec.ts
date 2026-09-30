import { expect, test } from '@playwright/test';
import { CANARY, watchSinks } from '../support/privacy-sinks.ts';

test('MS-PRIVACY-001 question → write → save → read again keeps canaries out of forbidden sinks', async ({ page }) => {
  const sinks = await watchSinks(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '답변 작성하기' }).click();
  await page.getByRole('textbox', { name: '내 답변' }).fill(CANARY.answer);
  await expect(page.getByText('기기에 임시 보관됨')).toBeVisible();
  await sinks.checkpoint();
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: '기억 조각으로 저장됐어요.' })).toBeFocused();
  await sinks.checkpoint();

  await page.getByRole('button', { name: '항해 기록 보기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '항해 기록' })).toBeVisible();
  await page.locator('.arca-memory-row').first().click();
  await expect(page.getByRole('heading', { level: 1, name: '기억 조각' })).toBeFocused();
  await expect(page.getByRole('region', { name: '내 답변' }).locator('.arca-user-text')).toHaveText(CANARY.answer);
  await sinks.assertClean();
});

test('MS-PRIVACY-001 nickname error → recovery → save, then delete-all keeps canaries out of forbidden sinks', async ({
  page,
}) => {
  const sinks = await watchSinks(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '설정' })).toBeVisible();
  await page.getByRole('button', { name: '닉네임 변경', exact: true }).click();
  const field = page.getByRole('textbox', { name: '닉네임' });
  await field.fill(`${CANARY.nickname}\u200b`);
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeDisabled();
  await expect(page.getByText('줄바꿈이나 보이지 않는 문자는 사용할 수 없어요.')).toBeVisible();
  await sinks.checkpoint();
  await field.fill(CANARY.nickname);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('닉네임을 변경했어요.')).toBeVisible();
  await expect(page.getByText(CANARY.nickname)).toBeVisible();
  await sinks.checkpoint();

  await page.getByRole('button', { name: '모든 데이터 삭제' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '모든 데이터 삭제' })).toBeVisible();
  await page.getByRole('button', { name: '삭제', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '삭제', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'ARCA 이야기' })).toBeVisible({ timeout: 15_000 });
  await sinks.assertClean();
});
