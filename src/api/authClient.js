const API_ROOT = (import.meta.env.VITE_MAIL_API_URL || "/mail-api/api").replace(/\/$/, "");
const AUTH_STORAGE_KEY = "bcb_payslip_auth_user";

async function request(path, payload) {
  const csrfToken = getCsrfToken();
  const response = await fetch(`${API_ROOT}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') clearStoredAuthUser();
    const error = new Error(data.error || "Request failed");
    error.status = response.status;
    error.mfaRequired = Boolean(data.mfaRequired);
    throw error;
  }
  return data;
}

export function getStoredAuthUser() {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeAuthUser(user, csrfToken) {
  const value = { ...user, csrfToken };
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
  return value;
}

export function clearStoredAuthUser() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getCsrfToken() {
  return getStoredAuthUser()?.csrfToken || null;
}

export async function loginWithEmail(email, password, mfaCode = "") {
  const data = await request("/auth/login", { email, passwordHash: password, mfaCode });
  return storeAuthUser(data.user, data.csrfToken);
}

export async function registerAccount(details) {
  return request("/auth/register", details);
}

export async function changeOwnPassword(currentPassword, newPassword) {
  const data = await request('/auth/change-password', { currentPassword, newPassword });
  return storeAuthUser(data.user, data.csrfToken);
}

export async function requestPasswordReset(email) {
  const resetPageUrl = `${window.location.origin}/reset-password`;
  return request("/auth/request-password-reset", { email, resetPageUrl });
}

export async function resetPassword(token, newPassword) {
  return request("/auth/password-reset", {
    token,
    newPasswordHash: newPassword,
  });
}

export async function logoutFromServer() {
  try {
    await request("/auth/logout", {});
  } finally {
    clearStoredAuthUser();
  }
}
