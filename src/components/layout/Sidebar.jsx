import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { LayoutDashboard, Contact, Upload, Layers3, ClipboardCheck, Send, History, ScrollText, BarChart3, Settings, UsersRound, UserCircle } from 'lucide-react';
import { resolveAssetUrl } from '@/api/portalClient';

export const navItems = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, group: 'Overview', permission: 'dashboard.view' },
  { label: 'Staff Directory', path: '/staff', icon: Contact, group: 'Staff', permission: 'staff.view' },
  { label: 'Import Staff', path: '/staff/upload-emails', icon: Upload, group: 'Staff', permission: 'staff.manage', desktopHidden: true },
  { label: 'Payroll Batches', path: '/payroll/batches', icon: Layers3, group: 'Payroll', permission: 'payroll.view' },
  { label: 'Payroll Approvals', path: '/payroll/approvals', icon: ClipboardCheck, group: 'Payroll', permission: 'payroll.approve' },
  { label: 'Send Payslips', path: '/payslips/send', icon: Send, group: 'Payslips', permission: 'payslips.send' },
  { label: 'Salary History', path: '/salary-history', icon: History, group: 'Records', permission: 'salary.view' },
  { label: 'Audit Logs', path: '/audit-logs', icon: ScrollText, group: 'Records', permission: 'audit.view' },
  { label: 'Reports', path: '/reports', icon: BarChart3, group: 'Records', permission: 'reports.view' },
  { label: 'Users & Access', path: '/users', icon: UsersRound, group: 'Administration', permission: 'users.view' },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'Administration', permission: 'settings.manage' },
  { label: 'My Profile', path: '/profile', icon: UserCircle, group: 'Administration', permission: 'profile.view', desktopHidden: true },
];

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const { can, portalSettings } = useAuth();
  const visible = navItems.filter((item) => can(item.permission) && !item.desktopHidden);
  const groups = [...new Set(visible.map((item) => item.group))];
  return <>
    {isOpen && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} />}
    <aside className={`fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 lg:sticky ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <Link to="/" onClick={onClose} className="flex items-center gap-3 border-b border-sidebar-border p-5">
        <img src={resolveAssetUrl(portalSettings?.bankLogo || '/assets/images/bcb-logo.png')} alt={portalSettings?.bankName || 'Bawjiase Community Bank'} className="h-11 w-11 rounded-full bg-white object-contain p-0.5" />
        <div className="min-w-0"><h1 className="truncate font-heading text-sm font-bold text-foreground">{portalSettings?.bankName || 'Bawjiase Community Bank'}</h1><p className="text-[11px] font-medium text-muted-foreground">{portalSettings?.portalName || 'Finance Payslip Platform'}</p></div>
      </Link>
      <nav className="flex-1 overflow-y-auto p-3">{groups.map((group) => <div key={group} className="mb-4"><p className="mb-1 px-3 text-[9px] font-bold uppercase tracking-[.22em] text-muted-foreground/70">{group}</p><div className="space-y-1">{visible.filter((item) => item.group === group).map((item) => { const Icon = item.icon; const active = location.pathname === item.path; return <Link key={item.path} to={item.path} onClick={onClose} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-primary text-primary-foreground shadow-md shadow-primary/15' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'}`}><Icon className="h-4 w-4 shrink-0" /><span>{item.label}</span></Link>; })}</div></div>)}</nav>
      <div className="border-t border-sidebar-border p-4"><div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Finance system online</span></div></div>
    </aside>
  </>;
}
