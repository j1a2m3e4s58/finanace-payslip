import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { LayoutDashboard, Contact, Upload, Layers3, ClipboardCheck, FileText, Send, History, ScrollText, BarChart3, Settings, UsersRound, UserCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveAssetUrl } from '@/api/portalClient';

export const navItems = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, group: 'Overview', permission: 'dashboard.view' },
  { label: 'Staff Directory', path: '/staff', icon: Contact, group: 'Staff', permission: 'staff.view' },
  { label: 'Import Staff', path: '/staff/upload-emails', icon: Upload, group: 'Staff', permission: 'staff.manage', desktopHidden: true },
  { label: 'Payroll Batches', path: '/payroll/batches', icon: Layers3, group: 'Payroll', permission: 'payroll.view' },
  { label: 'Payroll Approvals', path: '/payroll/approvals', icon: ClipboardCheck, group: 'Payroll', permission: 'payroll.approve' },
  { label: 'Payslip Preview', path: '/payslips/preview', icon: FileText, group: 'Payslips', permission: 'payslips.preview' },
  { label: 'Send Payslips', path: '/payslips/send', icon: Send, group: 'Payslips', permission: 'payslips.send' },
  { label: 'Salary History', path: '/salary-history', icon: History, group: 'Records', permission: 'salary.view' },
  { label: 'Audit Logs', path: '/audit-logs', icon: ScrollText, group: 'Records', permission: 'audit.view' },
  { label: 'Reports', path: '/reports', icon: BarChart3, group: 'Records', permission: 'reports.view' },
  { label: 'Users & Access', path: '/users', icon: UsersRound, group: 'Administration', permission: 'users.view' },
  { label: 'Portal Control', path: '/portal-control', icon: Settings, group: 'Platform', permission: 'portal.manage' },
  { label: 'My Profile', path: '/profile', icon: UserCircle, group: 'Administration', permission: 'profile.view', desktopHidden: true },
];

const healthPresentation = {
  checking: { label: 'Checking system status', dot: 'bg-slate-400', panel: 'bg-slate-500/10', text: 'text-muted-foreground' },
  online: { label: 'Finance system online', dot: 'bg-emerald-500', panel: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
  degraded: { label: 'Finance system degraded', dot: 'bg-amber-500', panel: 'bg-amber-500/10', text: 'text-amber-800 dark:text-amber-300' },
  offline: { label: 'Finance system offline', dot: 'bg-red-500', panel: 'bg-red-500/10', text: 'text-red-700 dark:text-red-300' },
};

export default function Sidebar({ isOpen, onClose, collapsed = true, onToggleCollapsed, systemHealth }) {
  const location = useLocation();
  const { can, portalSettings } = useAuth();
  const visible = navItems.filter((item) => can(item.permission) && !item.desktopHidden);
  const groups = [...new Set(visible.map((item) => item.group))];
  const health = healthPresentation[systemHealth?.status] || healthPresentation.checking;
  const healthTitle = `${health.label}${systemHealth?.pending ? ` · ${systemHealth.pending} queued` : ''}`;
  return <>
    {isOpen && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} />}
    <aside className={`fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-sidebar-border bg-sidebar transition-[width,transform] duration-300 lg:sticky ${collapsed ? 'lg:w-[76px]' : 'lg:w-72'} ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <button type="button" onClick={onToggleCollapsed} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title={collapsed ? 'Expand navigation' : 'Collapse navigation'} className="absolute -right-3.5 top-[4.6rem] z-10 hidden h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-card text-primary shadow-lg shadow-black/10 transition hover:scale-105 hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 lg:flex">
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
      <Link to="/" onClick={onClose} title={collapsed ? (portalSettings?.portalName || 'Finance Payslip Platform') : undefined} className={`flex min-h-20 items-center gap-3 border-b border-sidebar-border p-4 ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}>
        <img src={resolveAssetUrl(portalSettings?.bankLogo || '/assets/images/bcb-logo.png')} alt={portalSettings?.bankName || 'Bawjiase Community Bank'} className="h-11 w-11 rounded-full bg-white object-contain p-0.5" />
        <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}><h1 className="truncate font-heading text-sm font-bold text-foreground">{portalSettings?.bankName || 'Bawjiase Community Bank'}</h1><p className="text-[11px] font-medium text-muted-foreground">{portalSettings?.portalName || 'Finance Payslip Platform'}</p></div>
      </Link>
      <nav className={`flex-1 overflow-y-auto p-3 ${collapsed ? 'lg:px-2' : ''}`}>{groups.map((group) => <div key={group} className="mb-4"><p className={`mb-1 px-3 text-[9px] font-bold uppercase tracking-[.22em] text-muted-foreground/70 ${collapsed ? 'lg:hidden' : ''}`}>{group}</p><div className="space-y-1">{visible.filter((item) => item.group === group).map((item) => { const Icon = item.icon; const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`)); return <Link key={item.path} to={item.path} onClick={onClose} title={collapsed ? item.label : undefined} aria-label={collapsed ? item.label : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${collapsed ? 'lg:justify-center lg:px-2' : ''} ${active ? 'bg-primary text-primary-foreground shadow-md shadow-primary/15' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'}`}><Icon className="h-4 w-4 shrink-0" /><span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span></Link>; })}</div></div>)}</nav>
      <div className={`border-t border-sidebar-border p-4 ${collapsed ? 'lg:px-2' : ''}`}><button type="button" onClick={systemHealth?.refresh} title={healthTitle} aria-label={`${healthTitle}. Refresh system status`} className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:brightness-95 ${health.panel} ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${health.dot} ${systemHealth?.status === 'checking' ? 'animate-pulse motion-reduce:animate-none' : ''}`} /><span aria-live="polite" className={`text-xs font-semibold ${health.text} ${collapsed ? 'lg:hidden' : ''}`}>{health.label}</span></button></div>
    </aside>
  </>;
}
