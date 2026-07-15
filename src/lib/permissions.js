export const ROLES = {
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
  [ROLES.SUPER_ADMIN]: ['*'],
  [ROLES.ADMIN]: ['dashboard.view', 'staff.view', 'staff.manage', 'users.view', 'users.manage', 'settings.manage', 'profile.view', 'profile.edit', 'notifications.view'],
  [ROLES.FINANCE_OFFICER]: ['dashboard.view', 'staff.view', 'staff.manage', 'payroll.view', 'payroll.prepare', 'payslips.preview', 'delivery.view', 'salary.view', 'profile.view', 'profile.edit', 'notifications.view'],
  [ROLES.FINANCE_APPROVER]: ['dashboard.view', 'staff.view', 'payroll.view', 'payroll.approve', 'payslips.preview', 'payslips.send', 'delivery.view', 'salary.view', 'reports.view', 'profile.view', 'profile.edit', 'notifications.view'],
  [ROLES.AUDITOR]: ['audit.view', 'salary.view', 'reports.view', 'profile.view', 'profile.edit', 'notifications.view'],
  [ROLES.MANAGEMENT]: ['dashboard.view', 'payroll.view', 'reports.view', 'profile.view', 'profile.edit', 'notifications.view'],
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
  '/settings': 'settings.manage',
  '/profile': 'profile.view',
  '/notifications': 'notifications.view',
};

export function normalizeRole(role, department = '') {
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
  const permissions = rolePermissions[normalizeRole(user.role, user.department)] || [];
  return permissions.includes('*') || permissions.includes(permission);
}

export function roleLabel(role) {
  return ROLE_OPTIONS.find((item) => item.value === normalizeRole(role))?.label || 'Management';
}

export function firstAllowedPath(user) {
  if (user?.mustChangePassword) return '/change-password';
  if (['SuperAdmin', 'Admin', 'FinanceOfficer', 'FinanceApprover'].includes(user?.role) && !user?.mfaEnabled) return '/profile';
  return Object.entries(routePermissions).find(([, permission]) => hasPermission(user, permission))?.[0] || '/profile';
}
