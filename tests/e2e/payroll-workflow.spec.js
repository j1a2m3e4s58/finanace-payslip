import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';


const PASSWORD = 'E2E-Test#2026!';
const API_ROOT = '/mail-api/api';

async function login(page, email) {
  await page.goto('/login');
  await page.getByLabel('Official Email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|secure login/i }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

async function api(page, route, { method = 'GET', body } = {}) {
  return page.evaluate(async ({ apiRoot, route, method, body }) => {
    const stored = JSON.parse(sessionStorage.getItem('bcb_payslip_auth_user') || '{}');
    const response = await fetch(`${apiRoot}${route}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(stored.csrfToken ? { 'X-CSRF-Token': stored.csrfToken } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error(`${method} ${route} failed (${response.status}): ${typeof data === 'string' ? data : data.error || JSON.stringify(data)}`);
    return data;
  }, { apiRoot: API_ROOT, route, method, body });
}

async function switchAccount(page, email) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.removeItem('bcb_payslip_auth_user');
  });
  await login(page, email);
}

async function waitForDelivery(page, batchId, expected) {
  await expect.poll(async () => {
    const result = await api(page, `/payroll-batches/${batchId}/email-delivery`);
    return result.deliveries.filter((item) => !item.isTest && ['Sent', 'Delivered'].includes(item.status)).length;
  }, { timeout: 45_000, intervals: [500, 1000, 1500] }).toBe(expected);
}

test('staff to payroll approval, PDF, private bulk email, and correction workflow', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.includes('mobile');
  const suffix = mobile ? 'mobile' : 'desktop';
  const period = mobile ? '2027-11' : '2027-10';
  const staff = [
    {
      fullName: `E2E Akosua ${suffix}`,
      staffId: `E2E-${mobile ? 'M' : 'D'}-001`,
      department: 'FINANCE',
      position: 'Finance Assistant',
      branch: 'HEAD OFFICE',
      phone: '0201000001',
      email: `e2e.akosua.${suffix}@bawjiasecommunitybank.com`,
      employmentStatus: 'active',
      reason: 'Automated workflow test staff',
    },
    {
      fullName: `E2E Kofi ${suffix}`,
      staffId: `E2E-${mobile ? 'M' : 'D'}-002`,
      department: 'FINANCE',
      position: 'Finance Assistant',
      branch: 'HEAD OFFICE',
      phone: '0201000002',
      email: `e2e.kofi.${suffix}@bawjiasecommunitybank.com`,
      employmentStatus: 'active',
      reason: 'Automated workflow test staff',
    },
  ];

  await login(page, 'e2e.finance@bawjiasecommunitybank.com');
  await expect(page.getByRole('heading', { name: /finance payslip dashboard/i })).toBeVisible();

  const createdStaff = [];
  for (const record of staff) {
    const result = await api(page, '/staff-records', { method: 'POST', body: record });
    expect(result.record.staffId).toBe(record.staffId);
    createdStaff.push(result.record);
  }
  const deactivated = await api(page, `/staff-records/${createdStaff[1].id}/status`, {
    method: 'POST',
    body: { employmentStatus: 'inactive', reason: 'Automated staff departure control check' },
  });
  expect(deactivated.record.employmentStatus).toBe('inactive');
  const reactivated = await api(page, `/staff-records/${createdStaff[1].id}/status`, {
    method: 'POST',
    body: { employmentStatus: 'active', reason: 'Automated staff return control check' },
  });
  expect(reactivated.record.employmentStatus).toBe('active');
  await page.goto('/staff');
  await expect(page.getByText(staff[0].fullName, { exact: true }).filter({ visible: true })).toBeVisible();

  const created = await api(page, '/payroll-batches', {
    method: 'POST',
    body: { period, name: `E2E ${suffix} Payroll`, sourceBatchId: '' },
  });
  const batchId = created.batch.id;
  const manualValues = {
    basicSalary: 5000,
    supervisionAllowance: 0,
    riskAllowance: 0,
    responsibilityAllowance: 0,
    entertainmentAllowance: 0,
    fuelTransportAllowance: 300,
    rentUtilityAllowance: 0,
    otherAllowances: 0,
    payeIncomeTax: 250,
    staffWelfare: 20,
    icuDues: 10,
    loans: 0,
    otherDeductions: 0,
  };
  const entries = created.batch.entries.map((entry) => ({
    ...entry,
    ...manualValues,
    changeReason: 'Initial salary entry for automated end-to-end verification',
  }));
  const saved = await api(page, `/payroll-batches/${batchId}/draft`, { method: 'POST', body: { entries } });
  expect(saved.batch.summary.staffCount).toBe(2);
  expect(saved.batch.summary.totalNetSalary).toBeGreaterThan(0);
  const submitted = await api(page, `/payroll-batches/${batchId}/submit`, { method: 'POST', body: {} });
  expect(submitted.batch.status).toBe('submitted');

  await page.goto('/payroll/batches');
  await expect(page.getByText(`E2E ${suffix} Payroll`)).toBeVisible();
  await expect(page.getByText('Submitted', { exact: true }).first()).toBeVisible();

  await switchAccount(page, 'e2e.approver@bawjiasecommunitybank.com');
  const returned = await api(page, `/payroll-batches/${batchId}/decision`, {
    method: 'POST',
    body: { action: 'request_correction', comments: 'Automated correction request before approval' },
  });
  expect(returned.batch.status).toBe('rejected');
  expect(returned.batch.decisionType).toBe('request_correction');

  await switchAccount(page, 'e2e.finance@bawjiasecommunitybank.com');
  const correctedEntries = entries.map((entry, index) => ({
    ...entry,
    responsibilityAllowance: index === 0 ? 50 : entry.responsibilityAllowance,
    changeReason: index === 0
      ? 'Corrected responsibility allowance after approver review'
      : entry.changeReason,
  }));
  const corrected = await api(page, `/payroll-batches/${batchId}/draft`, {
    method: 'POST',
    body: { entries: correctedEntries },
  });
  expect(corrected.batch.status).toBe('corrected');
  const resubmitted = await api(page, `/payroll-batches/${batchId}/submit`, { method: 'POST', body: {} });
  expect(resubmitted.batch.status).toBe('submitted');

  await switchAccount(page, 'e2e.approver@bawjiasecommunitybank.com');
  const approved = await api(page, `/payroll-batches/${batchId}/approve`, {
    method: 'POST',
    body: { comments: 'Approved by automated maker-checker test' },
  });
  expect(approved.batch.status).toBe('approved');
  expect(approved.batch.approvedBy).toBe('E2E Finance Approver');

  await page.goto(`/payslips/preview?batch=${batchId}`);
  await expect(page.getByRole('heading', { name: /payslip pdf preview/i })).toBeVisible();
  await page.getByRole('button', { name: /preview selected/i }).click();
  await expect(page.locator('iframe[title^="Payslip preview"]')).toBeVisible();
  await expect(page.getByRole('link', { name: /full[- ]screen/i })).toBeVisible();

  const testEmail = await api(page, `/payroll-batches/${batchId}/email-test`, {
    method: 'POST',
    body: { email: 'e2e.approver@bawjiasecommunitybank.com' },
  });
  expect(testEmail.ok).toBe(true);
  const queued = await api(page, `/payroll-batches/${batchId}/send-payslips`, { method: 'POST', body: {} });
  expect(queued.queued).toBe(2);
  await waitForDelivery(page, batchId, 2);

  await page.goto(`/payslips/send?batch=${batchId}`);
  await expect(page.getByRole('heading', { name: /send payslips/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /final delivery summary/i })).toBeVisible();
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible();

  const capturePath = path.resolve('.tmp/e2e-smtp/messages.jsonl');
  await expect.poll(async () => (await fs.readFile(capturePath, 'utf8')).trim().split(/\r?\n/).filter(Boolean).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(3);
  const messages = (await fs.readFile(capturePath, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  for (const record of staff) {
    const captured = messages.find((message) => message.recipients.some((recipient) => recipient.includes(record.email)));
    expect(captured, `SMTP capture for ${record.email}`).toBeTruthy();
    expect(captured.recipients).toHaveLength(1);
    const headers = captured.data.split('\n\n', 1)[0];
    expect(headers).toContain(`To: ${record.email}`);
    for (const other of staff.filter((item) => item.email !== record.email)) expect(headers).not.toContain(other.email);
  }

  await switchAccount(page, 'e2e.finance@bawjiasecommunitybank.com');
  const revision = await api(page, `/payroll-batches/${batchId}/revise`, {
    method: 'POST',
    body: { reason: 'Automated correction workflow verification' },
  });
  expect(revision.batch.version).toBe(2);
  expect(revision.batch.status).toBe('draft');
  expect(revision.batch.revisesBatchId).toBe(batchId);
});

test('small-phone navigation remains usable at 320 pixels', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Small-phone check belongs to the mobile project');
  await page.setViewportSize({ width: 320, height: 568 });
  await login(page, 'e2e.finance@bawjiasecommunitybank.com');
  await expect(page.getByRole('button', { name: /search staff/i })).toBeVisible();
  await page.getByRole('button', { name: /search staff/i }).click();
  await expect(page.getByPlaceholder(/search staff name, id or email/i)).toBeVisible();
  await expect(page.locator('nav').filter({ hasText: 'More' })).toBeVisible();
  const moreButton = page.getByRole('button', { name: 'More', exact: true });
  await moreButton.click();
  await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'More' })).toBeHidden();
  await expect(moreButton).toBeFocused();
});

test('finance workspace fits the complete supported phone-width matrix', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Responsive matrix belongs to the mobile project');
  await login(page, 'e2e.admin@bawjiasecommunitybank.com');
  const widths = [320, 360, 390, 430];
  const routes = ['/', '/staff', '/users', '/reports', '/audit-logs', '/payslips/preview'];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), {
        message: `${route} should not overflow horizontally at ${width}px`,
      }).toBe(true);
      const shortTargets = await page.locator('main button:visible').evaluateAll((buttons) => buttons
        .map((button) => ({ label: button.getAttribute('aria-label') || button.textContent?.trim() || 'button', height: button.getBoundingClientRect().height }))
        .filter((item) => item.height > 0 && item.height < 43.5));
      expect(shortTargets, `${route} has undersized touch targets at ${width}px`).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/users');
  const manageButton = page.getByRole('button', { name: /manage user/i }).first();
  await manageButton.click();
  await expect(page.getByRole('dialog', { name: /manage/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /manage/i })).toBeHidden();
  await expect(manageButton).toBeFocused();
});

test('saved report and audit searches never persist in local storage', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Browser-storage privacy check belongs to the mobile project');
  await login(page, 'e2e.admin@bawjiasecommunitybank.com');
  await page.goto('/reports');
  await page.getByRole('button', { name: /report filters/i }).click();
  await page.getByPlaceholder('Search this report').fill('E2E private staff search');
  await page.getByPlaceholder('Name this filter').fill('Temporary report filter');
  await page.getByRole('button', { name: /save filter/i }).click();
  await page.goto('/audit-logs');
  await page.getByRole('button', { name: /audit filters/i }).click();
  await page.getByPlaceholder(/search users, actions/i).fill('E2E private identifier');
  await page.getByPlaceholder('Name this filter').fill('Temporary audit filter');
  await page.getByRole('button', { name: /save filter/i }).click();
  const sensitiveKeys = await page.evaluate(() => Object.keys(localStorage).filter((key) => /report|audit|staff|search|filter/i.test(key)));
  expect(sensitiveKeys).toEqual([]);
});
