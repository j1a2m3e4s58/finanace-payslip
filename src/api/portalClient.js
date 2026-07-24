import { clearStoredAuthUser, getCsrfToken } from "@/api/authClient";

const API_ROOT = (import.meta.env.VITE_MAIL_API_URL || "/mail-api/api").replace(/\/$/, "");

/**
 * @param {string} path
 * @param {{method?: string, body?: unknown}} [options]
 */
async function apiRequest(path, { method = "GET", body } = {}) {
  const csrfToken = getCsrfToken();
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken && method !== 'GET' ? { "X-CSRF-Token": csrfToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      clearStoredAuthUser();
      window.sessionStorage.setItem('bcb_session_message', 'Your secure session expired. Please sign in again.');
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    throw new Error(data.error || "Request failed");
  }
  return data;
}

async function fileRequest(path, extraHeaders = {}) {
  const response = await fetch(`${API_ROOT}${path}`, { credentials: 'include', headers: extraHeaders });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && typeof window !== 'undefined') {
      clearStoredAuthUser();
      window.sessionStorage.setItem('bcb_session_message', 'Your secure session expired. Please sign in again.');
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    throw new Error(data.error || 'File generation failed');
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i)?.[1]?.replaceAll('"', '') || 'payslip.pdf';
  return { blob: await response.blob(), filename: decodeURIComponent(filename) };
}

export function normalizeUser(user) {
  if (!user) return null;
  return {
    ...user,
    full_name: user.full_name || user.fullname || "User",
    fullname: user.fullname || user.full_name || "User",
    branch_name: user.branch_name || user.branch || "",
    branch: user.branch || user.branch_name || "",
    department: user.department || "",
    role: user.role || "Management",
    accountStatus: user.accountStatus || (user.isArchived ? "disabled" : user.isActive === false ? "suspended" : "active"),
    managedBranches: user.managedBranches || [],
    managedDepartmentsByBranch: user.managedDepartmentsByBranch || {},
    permissions: user.permissions || {},
  };
}

export function resolveAssetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const value = String(path).replace(/^\/+/, "");
  if (value.startsWith("LOCAL:")) {
    const filename = value.replace(/^LOCAL:/, "").trim();
    return filename ? `${API_ROOT.replace(/\/api$/, "")}/uploads/${filename}` : "";
  }
  if (value.startsWith("profile_pics/") || value.startsWith("assets/")) {
    return `/${value}`;
  }
  return `${API_ROOT.replace(/\/api$/, "")}/uploads/${value}`;
}

export function staffInManagerScope(manager, staffMember) {
  if (!manager || !staffMember) return false;
  if (["SuperAdmin", "Admin"].includes(manager.role) || manager?.permissions?.userManagement) return true;
  if (manager.role !== "Supervisor") return manager.id === staffMember.id;
  const branch = staffMember.branch || staffMember.branch_name || "";
  const department = staffMember.department || "";
  const managedBranches = manager.managedBranches || [];
  const branchAllowed = managedBranches.includes("ALL") || managedBranches.includes(branch);
  if (!branchAllowed) return false;
  const managedDepartments = manager.managedDepartmentsByBranch || {};
  const departmentScope = managedDepartments[branch] || managedDepartments.ALL || [];
  return departmentScope.includes("ALL") || departmentScope.includes(department);
}

export async function getPortalSettings() {
  const data = await apiRequest("/portal-settings");
  return data.settings;
}

export async function getSystemHealth() {
  return apiRequest('/health');
}

export async function getSystemSettings() {
  const data = await apiRequest('/system-settings');
  return data.settings;
}

export async function uploadBrandingAsset(file, assetType) {
  const form = new FormData();
  form.append('file', file);
  form.append('assetType', assetType);
  const csrfToken = getCsrfToken();
  const response = await fetch(`${API_ROOT}/system-settings/branding-upload`, { method: 'POST', credentials: 'include', headers: { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) }, body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Branding upload failed');
  return data.asset;
}

export async function updatePortalSettings(settings) {
  const data = await apiRequest("/portal-settings", {
    method: "POST",
    body: settings,
  });
  return data.settings;
}

export async function getSecurityStatus() {
  const data = await apiRequest('/security/status');
  return data.security;
}

export async function testSmtpConfiguration() { return apiRequest('/system-settings/test-smtp', { method: 'POST', body: {} }); }
export async function testPdfConfiguration() { return apiRequest('/system-settings/test-pdf', { method: 'POST', body: {} }); }

export async function getMfaStatus() { return apiRequest('/auth/mfa/status'); }
export async function startMfaEnrollment() { return apiRequest('/auth/mfa/enroll', { method: 'POST', body: {} }); }
export async function confirmMfaEnrollment(code) { return apiRequest('/auth/mfa/confirm', { method: 'POST', body: { code } }); }
export async function disableMfa(password, code) { return apiRequest('/auth/mfa/disable', { method: 'POST', body: { password, code } }); }

export function downloadSecureBackup() {
  return fileRequest('/backup/export');
}

export async function restoreSecureBackup(backupBase64, confirmation) {
  return apiRequest('/backup/restore', { method: 'POST', body: { backupBase64, confirmation } });
}

export async function getActiveStaff() {
  const data = await apiRequest("/staff/active");
  return (data.users || []).map(normalizeUser);
}

export async function getStaffDirectory(status = "all") {
  const data = await apiRequest(`/staff-records?status=${encodeURIComponent(status)}`);
  return data.records || [];
}

export async function createStaffRecord(payload) {
  const data = await apiRequest("/staff-records", { method: "POST", body: payload });
  return data.record;
}

export async function importStaffRecords(records, fileName, reason, schemaVersion) {
  const data = await apiRequest("/staff-records/import", { method: "POST", body: { records, fileName, reason, schemaVersion } });
  return data.records || [];
}

export async function updateStaffRecord(recordId, payload) {
  const data = await apiRequest(`/staff-records/${recordId}`, { method: "POST", body: payload });
  return data.record;
}

export async function changeStaffRecordStatus(recordId, employmentStatus, reason) {
  const data = await apiRequest(`/staff-records/${recordId}/status`, { method: "POST", body: { employmentStatus, reason } });
  return data.record;
}

export async function getStaffRecordAuditLogs() {
  const data = await apiRequest("/staff-records/audit");
  return data.logs || [];
}

export async function getPayrollBatches() {
  const data = await apiRequest('/payroll-batches');
  return data.batches || [];
}

export async function getReportingDashboard() {
  return apiRequest('/reporting/dashboard');
}

export async function getReportData(reportType, filters = {}) {
  const params = new URLSearchParams({ type: reportType });
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return apiRequest(`/reports?${params.toString()}`);
}

export function exportReport(reportType, format, filters = {}) {
  const params = new URLSearchParams({ type: reportType, format });
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  return fileRequest(`/reports/export?${params.toString()}`);
}

export async function createPayrollBatch(payload) {
  const data = await apiRequest('/payroll-batches', { method: 'POST', body: payload });
  return data.batch;
}

export async function getPayrollBatch(batchId) {
  const data = await apiRequest(`/payroll-batches/${batchId}`);
  return data.batch;
}

export async function savePayrollDraft(batchId, entries) {
  const data = await apiRequest(`/payroll-batches/${batchId}/draft`, { method: 'POST', body: { entries } });
  return data.batch;
}

export async function submitPayrollBatch(batchId) {
  const data = await apiRequest(`/payroll-batches/${batchId}/submit`, { method: 'POST', body: {} });
  return data.batch;
}

export async function cancelPayrollBatch(batchId, reason) {
  const data = await apiRequest(`/payroll-batches/${batchId}/cancel`, { method: 'POST', body: { reason } });
  return data.batch;
}

export async function approvePayrollBatch(batchId, comments = '') {
  const data = await apiRequest(`/payroll-batches/${batchId}/approve`, { method: 'POST', body: { comments } });
  return data.batch;
}

export async function decidePayrollBatch(batchId, action, comments) {
  const data = await apiRequest(`/payroll-batches/${batchId}/decision`, { method: 'POST', body: { action, comments } });
  return data.batch;
}

export async function getPayslipEmailDelivery(batchId) {
  return apiRequest(`/payroll-batches/${batchId}/email-delivery`);
}

export async function savePayslipEmailTemplate(batchId, subject, body) {
  const data = await apiRequest(`/payroll-batches/${batchId}/email-template`, { method: 'POST', body: { subject, body } });
  return data.template;
}

export async function sendPayslipTestEmail(batchId, payload) {
  return apiRequest(`/payroll-batches/${batchId}/email-test`, { method: 'POST', body: payload });
}

export async function sendAllPayslipEmails(batchId) {
  return apiRequest(`/payroll-batches/${batchId}/send-payslips`, { method: 'POST', body: {} });
}

export async function resendFailedPayslipEmails(batchId) {
  return apiRequest(`/payroll-batches/${batchId}/resend-failed`, { method: 'POST', body: {} });
}

export async function revisePayrollBatch(batchId, reason) {
  const data = await apiRequest(`/payroll-batches/${batchId}/revise`, { method: 'POST', body: { reason } });
  return data.batch;
}

export async function getSalaryHistory(staffRecordId = '') {
  const query = staffRecordId ? `?staffRecordId=${encodeURIComponent(staffRecordId)}` : '';
  const data = await apiRequest(`/salary-history${query}`);
  return data.history || [];
}

function payslipQuery(download = false) {
  const params = new URLSearchParams();
  if (download) params.set('download', '1');
  return params.toString();
}

function payslipHeaders(options = {}) {
  return { 'X-PDF-Password-Rule': options.passwordRule || 'none', ...(options.customPassword ? { 'X-PDF-Custom-Password': options.customPassword } : {}) };
}

export function getStaffPayslipPdf(batchId, staffRecordId, options = {}, download = false) {
  return fileRequest(`/payroll-batches/${batchId}/payslip/${staffRecordId}.pdf?${payslipQuery(download)}`, payslipHeaders(options));
}

export function getBatchPayslipsZip(batchId, options = {}) {
  return fileRequest(`/payroll-batches/${batchId}/payslips.zip`, payslipHeaders(options));
}

export async function getUsers() {
  const data = await apiRequest("/users");
  return (data.users || []).map(normalizeUser);
}

export async function getUserActivity(userId) {
  const data = await apiRequest(`/users/${userId}/activity`);
  return data.activity || [];
}

export async function createUser(payload) {
  const data = await apiRequest("/users", { method: "POST", body: payload });
  return normalizeUser(data.user);
}

export async function adminResetUserPassword(userId, password) {
  return apiRequest(`/users/${userId}/reset-password`, { method: "POST", body: { password } });
}

export async function adminResetUserMfa(userId) {
  return apiRequest(`/users/${userId}/reset-mfa`, { method: 'POST', body: {} });
}

export async function getLoginActivity() {
  const data = await apiRequest("/auth/activity");
  return data.activity || [];
}

export async function getArchivedStaff() {
  const data = await apiRequest("/staff/archived");
  return (data.users || []).map(normalizeUser);
}

export async function getStaffStats() {
  const data = await apiRequest("/staff/stats");
  return data.stats || data;
}

export async function getUserProfile(userId) {
  const data = await apiRequest(`/users/${userId}`);
  return normalizeUser(data.user);
}

export async function updateUserProfile(userId, payload) {
  const data = await apiRequest(`/users/${userId}/profile`, {
    method: "POST",
    body: payload,
  });
  return normalizeUser(data.user || data.ok);
}

export async function updateStaff(userId, payload) {
  const data = await apiRequest(`/staff/${userId}/update`, {
    method: "POST",
    body: payload,
  });
  return normalizeUser(data.user || data.ok);
}

export async function archiveStaff(userId) {
  return apiRequest(`/staff/${userId}/archive`, {
    method: "POST",
    body: {},
  });
}

export async function restoreStaff(userId) {
  return apiRequest(`/staff/${userId}/restore`, {
    method: "POST",
    body: {},
  });
}

export async function getAuditLogs() {
  const data = await apiRequest("/audit-logs");
  return data.logs || [];
}

export async function purgeSelectedAuditLogs(ids, reason) {
  return apiRequest("/audit-logs/purge-selected", {
    method: "POST",
    body: { ids, reason, confirmation: "DELETE AUDIT LOGS" },
  });
}

export async function getNotifications() {
  const data = await apiRequest("/notifications");
  return data.notifications || [];
}

export async function getUnreadNotificationCount() {
  const data = await apiRequest("/notifications/unread-count");
  return Number(data.count || 0);
}

export async function markNotificationRead(itemId) {
  return apiRequest(`/notifications/${itemId}/read`, {
    method: "POST",
    body: {},
  });
}

export async function markAllNotificationsRead() {
  return apiRequest("/notifications/read-all", {
    method: "POST",
    body: {},
  });
}

export async function deleteNotification(itemId) {
  return apiRequest(`/notifications/${itemId}/delete`, {
    method: "POST",
    body: {},
  });
}

export async function pingPresence(userId) {
  if (!userId) return null;
  return apiRequest("/presence/ping", {
    method: "POST",
    body: { userId },
  });
}

export async function logoutPresence(userId) {
  if (!userId) return null;
  return apiRequest("/presence/logout", {
    method: "POST",
    body: { userId },
  });
}

export async function uploadProfilePhoto(file) {
  const csrfToken = getCsrfToken();
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_ROOT}/uploads/profile-photo`, {
    method: "POST",
    credentials: 'include',
    headers: {
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Upload failed");
  }
  return data;
}
