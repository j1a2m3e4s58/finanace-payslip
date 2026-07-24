import React, { useEffect, useRef, useState } from 'react';
import { Code2, MoreHorizontal } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import Sidebar, { navItems } from './Sidebar';
import Header from './Header';
import { ROLES } from '@/lib/permissions';
import ResponsiveSheet from '@/components/ui/responsive-sheet';
import useSystemHealth from '@/hooks/useSystemHealth';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('bcb-sidebar-collapsed') !== 'false';
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef(null);
  const { user, can } = useAuth();
  const systemHealth = useSystemHealth();
  const location = useLocation();
  const mobileOrder = {
    [ROLES.BOSS_ADMIN]: ['/profile'],
    [ROLES.SUPER_ADMIN]: ['/', '/staff', '/users', '/profile'],
    [ROLES.ADMIN]: ['/', '/staff', '/users', '/profile'],
    [ROLES.FINANCE_OFFICER]: ['/', '/staff', '/payroll/batches', '/salary-history', '/profile'],
    [ROLES.FINANCE_APPROVER]: ['/', '/payroll/approvals', '/payslips/send', '/reports', '/profile'],
    [ROLES.AUDITOR]: ['/audit-logs', '/salary-history', '/reports', '/profile'],
    [ROLES.MANAGEMENT]: ['/', '/reports', '/profile'],
  }[user?.role] || ['/profile'];
  const mobileItems = mobileOrder.map((path) => navItems.find((item) => item.path === path)).filter((item) => item && can(item.permission));
  const primaryMobileItems = mobileItems.slice(0, 4);
  const extraMobileItems = navItems.filter((item) => can(item.permission) && !primaryMobileItems.some((primary) => primary.path === item.path) && !(user?.role === ROLES.BOSS_ADMIN && item.path === '/portal-control'));
  const gridClass = extraMobileItems.length ? 'grid-cols-5' : primaryMobileItems.length === 4 ? 'grid-cols-4' : primaryMobileItems.length === 3 ? 'grid-cols-3' : primaryMobileItems.length === 2 ? 'grid-cols-2' : 'grid-cols-1';
  const isActive = (path) => path === '/' ? location.pathname === '/' : location.pathname === path || location.pathname.startsWith(`${path}/`);
  useEffect(() => { setMoreOpen(false); }, [location.pathname]);
  useEffect(() => {
    window.localStorage.setItem('bcb-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);
  return <div className="flex min-h-screen bg-background">
    <a href="#main-content" className="fixed left-3 top-3 z-[120] -translate-y-24 rounded-lg bg-primary px-4 py-3 font-bold text-primary-foreground shadow-xl transition-transform focus:translate-y-0">Skip to main content</a>
    <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((current) => !current)} systemHealth={systemHealth} />
    <div className="flex min-w-0 flex-1 flex-col transition-[width] duration-300">
      <Header onMenuClick={() => setSidebarOpen(true)} user={user} />
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-x-hidden px-3 pb-24 pt-4 outline-none sm:px-4 lg:p-6"><div className="mx-auto w-full max-w-[1600px]"><Outlet /><footer className="mt-8 flex items-center justify-center gap-2 border-t border-border/70 py-5 text-center text-xs text-muted-foreground"><Code2 className="h-4 w-4 text-[#c89b2c]" aria-hidden="true" /><span>Site created by <strong className="font-semibold text-foreground">James Lincoln Awuah</strong></span></footer></div></main>
      <nav className={`fixed inset-x-0 bottom-0 z-40 grid ${gridClass} border-t border-border bg-background/95 px-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden`}>
        {primaryMobileItems.map((item) => { const Icon = item.icon; const active = isActive(item.path); return <Link key={item.path} to={item.path} className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[9px] font-semibold ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Icon className="h-4 w-4" /><span className="truncate">{item.label.replace('Payroll ', '')}</span></Link>; })}
        {extraMobileItems.length > 0 && <button ref={moreButtonRef} aria-expanded={moreOpen} aria-controls="mobile-more-navigation" onClick={() => setMoreOpen(true)} className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[9px] font-semibold text-muted-foreground"><MoreHorizontal className="h-4 w-4" /><span>More</span></button>}
      </nav>
      <ResponsiveSheet open={moreOpen} onOpenChange={setMoreOpen} returnFocusRef={moreButtonRef} title="More" description="Additional pages available for your role." className="md:hidden"><div id="mobile-more-navigation" className="grid grid-cols-2 gap-2">{extraMobileItems.map((item) => { const Icon = item.icon; return <Link key={item.path} to={item.path} onClick={() => setMoreOpen(false)} className={`flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm font-semibold ${isActive(item.path) ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}><Icon className="h-4 w-4 text-primary" />{item.label}</Link>; })}</div></ResponsiveSheet>
    </div>
  </div>;
}
