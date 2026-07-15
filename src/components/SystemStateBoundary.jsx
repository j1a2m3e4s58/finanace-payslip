import React, { useEffect, useState } from 'react';
import { AlertTriangle, WifiOff } from 'lucide-react';

export class SystemStateBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('BCB interface error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="grid min-h-screen place-items-center bg-background p-5 text-foreground"><section className="w-full max-w-md rounded-2xl border border-red-500/30 bg-card p-6 text-center shadow-xl"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-500/10 text-red-600"><AlertTriangle className="h-6 w-6" /></span><h1 className="mt-4 font-heading text-2xl font-bold">This page could not be displayed</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Your saved payroll data was not changed. Refresh the page; if the problem continues, contact the system administrator with the time it occurred.</p><button type="button" onClick={() => window.location.reload()} className="mt-5 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Reload securely</button></section></main>;
  }
}

export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  if (online) return null;
  return <div role="status" className="fixed inset-x-3 top-3 z-[100] mx-auto flex max-w-xl items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-50/95 px-4 py-3 text-sm font-semibold text-amber-900 shadow-xl backdrop-blur dark:bg-amber-950/95 dark:text-amber-100"><WifiOff className="h-4 w-4" />You are offline. Saving and sending are paused until the connection returns.</div>;
}
