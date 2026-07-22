import React, { useEffect, useMemo, useState } from 'react';
import { Download, MoreVertical, PlusSquare, Share2, Smartphone } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';

const PUBLIC_PATHS = new Set(['/login', '/register', '/forgot-password', '/reset-password']);

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function PwaInstallPrompt() {
  const location = useLocation();
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [guideOpen, setGuideOpen] = useState(false);
  const isIos = useMemo(() => /iphone|ipad|ipod/i.test(window.navigator.userAgent), []);

  useEffect(() => {
    const captureInstall = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
      toast.success('BCB Payslips is now available from your home screen.', { title: 'Finance app installed' });
    };
    window.addEventListener('beforeinstallprompt', captureInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (installed || !PUBLIC_PATHS.has(location.pathname) || (!installEvent && !isIos)) return null;

  const install = async () => {
    if (!installEvent) {
      setGuideOpen(true);
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === 'accepted') {
      toast.success('The secure finance app is being added to your device.', { title: 'Installation started' });
    }
  };

  return <>
    <button type="button" onClick={install} className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-40 inline-flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full border border-[#d7a92d]/60 bg-[#064e3b] px-4 text-xs font-bold text-white shadow-[0_16px_44px_-12px_rgba(0,45,30,.75)] transition hover:-translate-y-0.5 hover:bg-[#075f47] sm:left-5 sm:translate-x-0" aria-label="Install BCB Finance Payslip application">
      <img src="/icons/bcb-finance-192.png" alt="" className="h-8 w-8 rounded-lg" />
      <span>Install Finance App</span>
      <Download className="h-4 w-4 text-[#f1c54b]" />
    </button>
    <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="pr-12 text-left">
          <div className="mb-2 flex items-center gap-3"><img src="/icons/bcb-finance-192.png" alt="BCB Finance app" className="h-14 w-14 rounded-xl shadow-md" /><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Secure phone access</p><DialogTitle className="mt-1 font-heading text-xl">Install BCB Payslips</DialogTitle></div></div>
          <DialogDescription>Add the finance platform to your home screen without storing payroll information offline.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm">
          <InstallStep icon={Share2} number="1">Tap the browser <b>Share</b> button.</InstallStep>
          <InstallStep icon={PlusSquare} number="2">Select <b>Add to Home Screen</b>.</InstallStep>
          <InstallStep icon={Smartphone} number="3">Confirm the name <b>BCB Payslips</b> and tap <b>Add</b>.</InstallStep>
        </ol>
        <p className="rounded-xl border border-primary/15 bg-primary/[.05] p-3 text-xs leading-5 text-muted-foreground"><MoreVertical className="mr-1 inline h-4 w-4 text-primary" />On Android browsers without an automatic prompt, open the browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>
      </DialogContent>
    </Dialog>
  </>;
}

function InstallStep({ icon: Icon, number, children }) {
  return <li className="flex items-center gap-3 rounded-xl border border-border bg-muted/25 p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{number}</span><Icon className="h-5 w-5 shrink-0 text-[#b88912]" /><span>{children}</span></li>;
}
