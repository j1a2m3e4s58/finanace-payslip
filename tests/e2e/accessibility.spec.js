import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PASSWORD = 'E2E-Test#2026!';

async function login(page) {
  await page.goto('/login');
  await page.getByLabel('Official Email').fill('e2e.admin@bawjiasecommunitybank.com');
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|secure login/i }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function expectNoSeriousViolations(page) {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations.filter((item) => ['serious', 'critical'].includes(item.impact));
  expect(violations, violations.map((item) => `${item.id}: ${item.help} (${item.nodes.length})`).join('\n')).toEqual([]);
}

async function expectNoHorizontalPageOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `page width ${dimensions.scrollWidth}px exceeded viewport ${dimensions.clientWidth}px`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectFormControlsAreTouchFriendly(page) {
  const controls = page.locator('main button:visible, main input:visible:not(.sr-only), main select:visible, main textarea:visible');
  const count = await controls.count();
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    if (await control.isDisabled()) continue;
    const box = await control.boundingBox();
    if (!box) continue;
    const description = await control.evaluate((element) => `${element.tagName.toLowerCase()} ${element.getAttribute('aria-label') || element.textContent?.trim() || element.getAttribute('placeholder') || ''}`.slice(0, 100));
    expect(Math.max(box.width, box.height), `${description} has no 44px touch dimension`).toBeGreaterThanOrEqual(43.5);
    expect(box.height, `${description} is shorter than 40px`).toBeGreaterThanOrEqual(39.5);
  }
}

test.describe('accessible banking workspace', () => {
  test.setTimeout(240_000);
  test('public sign-in is keyboard and screen-reader ready', async ({ page }) => {
    await page.goto('/login');
    await expectNoSeriousViolations(page);
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
  });

  test('core authorized pages have no serious accessibility violations', async ({ page }) => {
    await login(page);
    for (const route of ['/', '/staff', '/users', '/reports', '/audit-logs', '/portal-control']) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      await expectNoSeriousViolations(page);
    }
  });

  test('remaining public and authorized pages have accessible names and structure', async ({ page }) => {
    for (const route of ['/register', '/forgot-password', '/reset-password']) {
      await page.goto(route);
      await expectNoSeriousViolations(page);
    }

    await login(page);
    for (const route of ['/staff/upload-emails', '/staff/new', '/payroll/batches', '/payroll/approvals', '/payslips/preview', '/payslips/send', '/salary-history', '/profile', '/notifications']) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      await expectNoSeriousViolations(page);
    }
  });

  test('small-phone and tablet layouts remain usable without page overflow', async ({ page }) => {
    await login(page);
    const viewports = [
      { width: 320, height: 700 },
      { width: 360, height: 780 },
      { width: 390, height: 844 },
      { width: 430, height: 900 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
    ];
    const routes = ['/staff', '/users', '/payroll/batches', '/payslips/send', '/reports', '/audit-logs'];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator('main')).toBeVisible();
        await expectNoHorizontalPageOverflow(page);
        if (viewport.width <= 430) await expectFormControlsAreTouchFriendly(page);
      }
    }
  });

  test('skip link and reduced-motion preference are supported', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page);
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skipLink).toBeFocused();
    await skipLink.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    const animationDuration = await page.locator('#main-content').evaluate((element) => getComputedStyle(element).animationDuration);
    expect(['0.01ms', '1e-05s']).toContain(animationDuration);
  });
});
