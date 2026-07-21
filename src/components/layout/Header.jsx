import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, Moon, Search, Sun, UserCircle, X } from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getUnreadNotificationCount } from '@/api/portalClient';

export default function Header({ onMenuClick, user }) {
  const { theme, toggleTheme, policy } = useTheme();
  const { logout, can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const displayName = user?.full_name || user?.fullname || 'Finance User';
  const initials = displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const canViewNotifications = can('notifications.view');
  const submitSearch = (event) => {
    event.preventDefault();
    if (search.trim()) {
      navigate(`/staff?search=${encodeURIComponent(search.trim())}`);
      setSearchOpen(false);
    }
  };
  const handleLogout = async () => { await logout(); navigate('/login', { replace: true }); };

  useEffect(() => {
    if (!canViewNotifications) return;
    getUnreadNotificationCount().then(setUnread).catch(() => setUnread(0));
  }, [canViewNotifications]);

  const canToggleTheme = policy.allowLightMode && policy.allowDarkMode;
  return <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
    <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
      <button onClick={onMenuClick} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
      {can('staff.view') && <form onSubmit={submitSearch} className="relative min-w-0 max-w-md flex-1 max-[359px]:hidden">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff..." className="h-10 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/25" />
      </form>}
      <div className="ml-auto flex items-center gap-1">
        {can('staff.view') && <button onClick={() => setSearchOpen((current) => !current)} className="hidden min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted max-[359px]:flex" aria-label={searchOpen ? 'Close staff search' : 'Search staff'}>{searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}</button>}
        {canToggleTheme && <button onClick={toggleTheme} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted" aria-label="Toggle theme">{theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>}
        {canViewNotifications && <Link to="/notifications" className="relative flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted" aria-label={`${unread} unread notifications`}>
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-black ring-2 ring-background">{unread > 9 ? '9+' : unread}</span>}
        </Link>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button className="ml-1 flex items-center gap-2 border-l border-border pl-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">{initials}</span><span className="hidden text-left lg:block"><span className="block text-sm font-semibold leading-tight">{displayName}</span><span className="block text-xs text-muted-foreground">{user?.role === 'BossAdmin' ? 'Boss Admin' : user?.role || 'Finance staff'}</span></span></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52"><DropdownMenuItem asChild><Link to="/profile"><UserCircle className="h-4 w-4" /> My Profile</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={handleLogout} className="text-destructive"><LogOut className="h-4 w-4" /> Sign out</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    {searchOpen && can('staff.view') && <form onSubmit={submitSearch} className="absolute inset-x-0 top-full border-b border-border bg-background p-3 shadow-lg min-[360px]:hidden"><label className="relative block"><span className="sr-only">Search staff</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff name, ID or email" className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-20 text-sm outline-none focus:ring-2 focus:ring-primary/25" /><button type="submit" className="absolute right-1.5 top-1/2 min-h-8 -translate-y-1/2 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground">Search</button></label></form>}
  </header>;
}
