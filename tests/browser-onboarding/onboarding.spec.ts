import { expect, type Page, test } from '@playwright/test';

async function toBoarding(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'ARCA 이야기' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '탑승 준비' })).toBeFocused();
}

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

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('intro → consent → passenger → nickname → first question', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await toBoarding(page);

  await page.getByText('에 동의해요').first().click();
  await page.getByRole('checkbox', { name: '필수, 개인정보처리방침에 동의' }).check();
  await page.getByRole('button', { name: '동의하고 탑승하기' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'ARCA에 탑승했어요' })).toBeFocused();
  await expect(page).toHaveURL(/\/join\/complete$/);
  await page.getByRole('textbox', { name: '닉네임, 선택 입력' }).fill('합성 항해자');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { level: 1, name: '오늘의 항해' })).toBeFocused();
  await expect(page).toHaveURL(/\/today$/);
  expect(page.url()).not.toMatch(/synthetic|token|SYN-|%ED%95%A9/);
  expect(errors).toEqual([]);
});

test('320px with 200% text: every intro scene and consent screen reflow without horizontal scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await expect(page.getByRole('heading', { level: 1, name: 'ARCA 이야기' })).toBeVisible({ timeout: 15_000 });
  const board = page.getByRole('button', { name: '탑승 준비하기' });
  for (let press = 0; press < 30 && !(await board.isVisible()); press += 1) {
    await noHorizontalScroll(page);
    await page.getByRole('button', { name: '다음' }).click();
  }
  await noHorizontalScroll(page);
  await board.scrollIntoViewIfNeeded();
  await expect(board).toBeInViewport();

  await page.getByRole('button', { name: '건너뛰기' }).click();
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  await noHorizontalScroll(page);
  const consent = page.getByRole('button', { name: '동의하고 탑승하기' });
  await consent.scrollIntoViewIfNeeded();
  await expect(consent).toBeInViewport();
});

test('typing never moves a character to another line (balanced wrapping stays fixed)', async ({ page }) => {
  const target = '탑승구가 닫히면, 당신의 이야기와 함께 항해가 시작됩니다.';
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'ARCA 이야기' })).toBeVisible({ timeout: 15_000 });
    const sentence = page.locator('.arca-intro-dialog > p.arca-visually-hidden');
    for (let press = 0; press < 30 && (await sentence.textContent()) !== target; press += 1) {
      await page.getByRole('button', { name: '다음' }).click();
    }
    await expect(sentence).toHaveText(target);
    const moved = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const line = () => document.querySelector('.arca-intro-line:not(.arca-intro-line--ghost)') as HTMLElement;
          const tops = () => {
            const result: number[] = [];
            const walker = document.createTreeWalker(line(), NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const text = node.textContent ?? '';
              for (let offset = 0; offset < text.length; offset += 1) {
                const range = document.createRange();
                range.setStart(node, offset);
                range.setEnd(node, offset + 1);
                result.push(Math.round(range.getBoundingClientRect().top));
              }
            }
            return result;
          };
          const typing = () =>
            Array.from(line().querySelectorAll('.arca-intro-line__rest')).some((span) => span.textContent);
          const first = tops();
          let changes = 0;
          const tick = () => {
            tops().forEach((top, index) => {
              if (top !== first[index]) changes += 1;
            });
            if (typing()) requestAnimationFrame(tick);
            else resolve(changes);
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(moved, `line changes at ${width}px`).toBe(0);
  }
});

test('the F01, F02 and F03 Primaries share one bottom position', async ({ page }) => {
  for (const [width, height] of [
    [360, 740],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'ARCA 이야기' })).toBeVisible({ timeout: 15_000 });
    const bottomOf = async (name: string) => {
      const box = await page.getByRole('button', { name }).boundingBox();
      return Math.round((box?.y ?? 0) + (box?.height ?? 0));
    };
    const board = page.getByRole('button', { name: '탑승 준비하기' });
    for (let press = 0; press < 30 && !(await board.isVisible()); press += 1) {
      await page.getByRole('button', { name: '다음' }).click();
    }
    const intro = await bottomOf('탑승 준비하기');
    await board.click();
    await expect(page.getByRole('heading', { level: 1, name: '탑승 준비' })).toBeFocused();
    const join = await bottomOf('동의하고 탑승하기');
    await page.getByText('에 동의해요').first().click();
    await page.getByRole('checkbox', { name: '필수, 개인정보처리방침에 동의' }).check();
    await page.getByRole('button', { name: '동의하고 탑승하기' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'ARCA에 탑승했어요' })).toBeFocused();
    const complete = await bottomOf('첫 질문 만나기');
    expect([join, complete], `bottoms at ${width}px`).toEqual([intro, intro]);
  }
});

test('no native tap highlight on F01, F02 and F03 controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'ARCA 이야기' })).toBeVisible({ timeout: 15_000 });
  await expectNoTapHighlight(page);
  await page.getByRole('button', { name: '건너뛰기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '탑승 준비' })).toBeFocused();
  await expectNoTapHighlight(page);
  await page.getByText('에 동의해요').first().click();
  await page.getByRole('checkbox', { name: '필수, 개인정보처리방침에 동의' }).check();
  await page.getByRole('button', { name: '동의하고 탑승하기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'ARCA에 탑승했어요' })).toBeFocused();
  await expectNoTapHighlight(page);
});
