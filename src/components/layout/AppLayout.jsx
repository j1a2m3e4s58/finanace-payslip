import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import Sidebar, { navItems } from './Sidebar';
import Header from './Header';
import { ROLES } from '@/lib/permissions';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreSheetRef = useRef(null);
  const { user, can } = useAuth();
  const location = useLocation();
  const mobileOrder = {
    [ROLES.SUPER_ADMIN]: ['/', '/staff', '/users', '/settings', '/profile'],
    [ROLES.ADMIN]: ['/', '/staff', '/users', '/settings', '/profile'],
    [ROLES.FINANCE_OFFICER]: ['/', '/staff', '/payroll/batches', '/salary-history', '/profile'],
    [ROLES.FINANCE_APPROVER]: ['/', '/payroll/approvals', '/payslips/send', '/reports', '/profile'],
    [ROLES.AUDITOR]: ['/audit-logs', '/salary-history', '/reports', '/profile'],
    [ROLES.MANAGEMENT]: ['/', '/payroll/batches', '/reports', '/profile'],
  }[user?.role] || ['/profile'];
  const mobileItems = mobileOrder.map((path) => navItems.find((item) => item.path === path)).filter((item) => item && can(item.permission));
  const primaryMobileItems = mobileItems.slice(0, 4);
  const extraMobileItems = navItems.filter((item) => can(item.permission) && !primaryMobileItems.some((primary) => primary.path === item.path));
  const gridClass = extraMobileItems.length ? 'grid-cols-5' : primaryMobileItems.length === 4 ? 'grid-cols-4' : primaryMobileItems.length === 3 ? 'grid-cols-3' : 'grid-cols-2';
  const isActive = (path) => path === '/' ? location.pathname === '/' : location.pathname === path || location.pathname.startsWith(`${path}/`);
  useEffect(() => { setMoreOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const sheet = moreSheetRef.current;
    sheet?.querySelector('button, a')?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { setMoreOpen(false); return; }
      if (event.key !== 'Tab' || !sheet) return;
      const focusable = [...sheet.querySelectorAll('button:not([disabled]), a[href]')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); };
  }, [moreOpen]);
  return <div className="flex min-h-screen bg-background">
    <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    <div className="flex min-w-0 flex-1 flex-col">
      <Header onMenuClick={() => setSidebarOpen(true)} user={user} />
      <main className="flex-1 overflow-x-hidden p-4 pb-24 lg:p-6"><div className="mx-auto w-full max-w-[1600px]"><Outlet /></div></main>
      <nav className={`fixed inset-x-0 bottom-0 z-40 grid ${gridClass} border-t border-border bg-background/95 px-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden`}>
        {primaryMobileItems.map((item) => { const Icon = item.icon; const active = isActive(item.path); return <Link key={item.path} to={item.path} className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[9px] font-semibold ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Icon className="h-4 w-4" /><span className="truncate">{item.label.replace('Payroll ', '')}</span></Link>; })}
        {extraMobileItems.length > 0 && <button aria-expanded={moreOpen} aria-controls="mobile-more-navigation" onClick={() => setMoreOpen(true)} className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[9px] font-semibold text-muted-foreground"><MoreHorizontal className="h-4 w-4" /><span>More</span></button>}
      </nav>
      {moreOpen && <div className="fixed inset-0 z-[60] bg-black/60 lg:hidden" onClick={() => setMoreOpen(false)}><div id="mobile-more-navigation" ref={moreSheetRef} role="dialog" aria-modal="true" aria-labelledby="mobile-more-title" className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex items-center justify-between"><h2 id="mobile-more-title" className="font-heading text-lg font-bold">More</h2><button className="min-h-11 min-w-11 rounded-lg p-2" onClick={() => setMoreOpen(false)} aria-label="Close more navigation"><X className="mx-auto h-5 w-5" /></button></div><div className="grid grid-cols-2 gap-2">{extraMobileItems.map((item) => { const Icon = item.icon; return <Link key={item.path} to={item.path} onClick={() => setMoreOpen(false)} className={`flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm font-semibold ${isActive(item.path) ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}><Icon className="h-4 w-4 text-primary" />{item.label}</Link>; })}</div></div></div>}
    </div>
  </div>;
}
