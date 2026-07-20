export const ROLES = {
  BOSS_ADMIN: 'BossAdmin',
  SUPER_ADMIN: 'SuperAdmin',
  ADMIN: 'Admin',
  FINANCE_OFFICER: 'FinanceOfficer',
  FINANCE_APPROVER: 'FinanceApprover',
  AUDITOR: 'Auditor',
  MANAGEMENT: 'Management',
};

export const ROLE_OPTIONS = [
  { value: ROLES.SUPER_ADMIN, label: 'Super Admin' },
  { value: ROLES.ADMIN, label: 'Admin' },
  { value: ROLES.FINANCE_OFFICER, label: 'Finance Officer' },
  { value: ROLES.FINANCE_APPROVER, label: 'Finance Approver' },
  { value: ROLES.AUDITOR, label: 'Auditor' },
  { value: ROLES.MANAGEMENT, label: 'Management' },
];

const rolePermissions = {
  [ROLES.BOSS_ADMIN]: ['portal.manage', 'profile.view', 'profile.edit'],
  [ROLES.SUPER_ADMIN]: ['*'],
  [ROLES.ADMIN]: ['dashboard.view', 'staff.view', 'staff.manage', 'users.view', 'users.manage', 'profile.view', 'profile.edit', 'notifications.view'],
  [ROLES.FINANCE_OFFICER]: ['dashboard.view', 'staff.view', 'staff.manage', 'payroll.view', 'payroll.prepare', 'payslips.preview', 'delivery.view', 'salary.view', 'profile.view', 'profile.edit', 'notifications.view'],
  [ROLES.FINANCE_APPROVER]: ['dashboard.view', 'staff.view', 'payroll.view', 'payroll.approve', 'payslips.preview', 'payslips.send', 'delivery.view', 'salary.view', 'reports.view', 'profile.view', 'profile.edit', 'notifications.view'],
  [ROLES.AUDITOR]: ['audit.view', 'salary.view', 'reports.view', 'profile.view', 'profile.edit', 'notifications.view'],
  [ROLES.MANAGEMENT]: ['dashboard.view', 'reports.view', 'profile.view', 'profile.edit', 'notifications.view'],
};

export const routePermissions = {
  '/': 'dashboard.view',
  '/staff': 'staff.view',
  '/staff/upload-emails': 'staff.manage',
  '/staff/new': 'staff.manage',
  '/payroll/batches': 'payroll.view',
  '/payroll/entry': 'payroll.prepare',
  '/payroll/approvals': 'payroll.approve',
  '/payslips/preview': 'payslips.preview',
  '/payslips/send': 'payslips.send',
  '/salary-history': 'salary.view',
  '/audit-logs': 'audit.view',
  '/reports': 'reports.view',
  '/users': 'users.view',
  '/portal-control': 'portal.manage',
  '/settings': 'portal.manage',
  '/profile': 'profile.view',
  '/notifications': 'notifications.view',
};

export function normalizeRole(role, department = '') {
  if (role === ROLES.BOSS_ADMIN) return ROLES.BOSS_ADMIN;
  if (role === 'HRAdmin') return ROLES.ADMIN;
  if (role === 'GeneralStaff') {
    if (String(department).toUpperCase() === 'FINANCE') return ROLES.FINANCE_OFFICER;
    if (['AUDIT', 'INTERNAL AUDIT', 'COMPLIANCE'].includes(String(department).toUpperCase())) return ROLES.AUDITOR;
    return ROLES.MANAGEMENT;
  }
  return ROLE_OPTIONS.some((item) => item.value === role) ? role : ROLES.MANAGEMENT;
}

export function hasPermission(user, permission) {
  if (!user || !permission || user.accountStatus !== 'active') return false;
  const normalizedRole = normalizeRole(user.role, user.department);
  if (permission === 'portal.manage') return normalizedRole === ROLES.BOSS_ADMIN;
  const permissions = rolePermissions[normalizedRole] || [];
  return permissions.includes('*') || permissions.includes(permission);
}

export function roleLabel(role) {
  if (role === ROLES.BOSS_ADMIN) return 'Boss Admin';
  return ROLE_OPTIONS.find((item) => item.value === normalizeRole(role))?.label || 'Management';
}

export function firstAllowedPath(user, settings = {}) {
  if (user?.mustChangePassword) return '/change-password';
  if (user?.role === ROLES.BOSS_ADMIN) return '/portal-control';
  const localTesting = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const privilegedMfaRequired = !localTesting && settings?.requirePrivilegedMfa !== false && settings?.mfaEnrollmentAvailable !== false;
  if (privilegedMfaRequired && ['BossAdmin', 'SuperAdmin', 'Admin', 'FinanceOfficer', 'FinanceApprover'].includes(user?.role) && !user?.mfaEnabled) return '/profile';
  return Object.entries(routePermissions).find(([, permission]) => hasPermission(user, permission))?.[0] || '/profile';
}
