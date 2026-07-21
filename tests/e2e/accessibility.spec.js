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

test.describe('accessible banking workspace', () => {
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
