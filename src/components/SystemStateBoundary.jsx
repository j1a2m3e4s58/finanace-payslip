import React, { useEffect, useState } from 'react';
import { AlertTriangle, Building2, RefreshCcw, WifiOff } from 'lucide-react';

export function AppLoadingState({ label = 'Preparing your secure workspace…' }) {
  return <main aria-busy="true" aria-live="polite" className="grid min-h-[100dvh] place-items-center bg-background p-5 text-foreground">
    <section className="w-full max-w-sm rounded-2xl border border-primary/15 bg-card p-6 text-center shadow-xl">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary"><Building2 className="h-7 w-7" aria-hidden="true" /></span>
      <h1 className="mt-4 font-heading text-xl font-bold">Bawjiase Finance Payslip Platform</h1>
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
      <div className="mx-auto mt-5 h-2 w-full max-w-52 overflow-hidden rounded-full bg-muted"><span className="block h-full w-1/2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" /></div>
    </section>
  </main>;
}

export function PageState({ type = 'empty', title, message, onRetry, retryLabel = 'Try again' }) {
  const offline = type === 'offline';
  const Icon = offline ? WifiOff : type === 'error' ? AlertTriangle : Building2;
  return <section role={type === 'error' ? 'alert' : 'status'} className="mx-auto grid min-h-64 w-full max-w-xl place-items-center rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
    <div><span className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${type === 'error' ? 'bg-red-500/10 text-red-600' : offline ? 'bg-amber-500/10 text-amber-700' : 'bg-primary/10 text-primary'}`}><Icon className="h-6 w-6" aria-hidden="true" /></span>
      <h2 className="mt-4 font-heading text-xl font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
      {onRetry && <button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"><RefreshCcw className="h-4 w-4" aria-hidden="true" />{retryLabel}</button>}
    </div>
  </section>;
}

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
    return <main className="grid min-h-screen place-items-center bg-background p-5 text-foreground"><section role="alert" className="w-full max-w-md rounded-2xl border border-red-500/30 bg-card p-6 text-center shadow-xl"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-500/10 text-red-600"><AlertTriangle className="h-6 w-6" aria-hidden="true" /></span><h1 className="mt-4 font-heading text-2xl font-bold">This page could not be displayed</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Your saved payroll data was not changed. Refresh the page; if the problem continues, contact the system administrator with the time it occurred.</p><button type="button" onClick={() => window.location.reload()} className="mt-5 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Reload securely</button></section></main>;
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
