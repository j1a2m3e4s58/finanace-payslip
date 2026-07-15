import React from "react";
import { Check, Moon, ShieldCheck, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/ThemeContext";

export function LogoBadge() {
  return (
    <div className="grid h-16 w-16 place-items-center rounded-full border border-primary/10 bg-card/95 shadow-[0_12px_34px_-12px_rgba(0,80,50,.35)] ring-8 ring-background/35 backdrop-blur-xl">
      <ShieldCheck className="h-8 w-8 text-primary" strokeWidth={1.7} />
    </div>
  );
}

function BrandPanel() {
  return (
    <section className="auth-brand-panel relative h-[19rem] shrink-0 overflow-hidden lg:h-auto lg:min-h-[100dvh]">
      <img src="/assets/images/auth-bg.jpg" alt="Bawjiase Community Bank building" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#004a31]/95 via-[#00643d]/78 to-[#003924]/88" />
      <div className="auth-brand-swoops absolute" aria-hidden="true" />
      <div className="auth-brand-rings absolute left-1/2 top-[46%] h-[19rem] w-[19rem] -translate-x-1/2 -translate-y-1/2 rounded-full sm:h-[22rem] sm:w-[22rem] lg:left-[42%] lg:top-[42%] lg:h-[25rem] lg:w-[25rem]" aria-hidden="true" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-5 pb-8 pt-8 lg:items-start lg:justify-between lg:px-[7%] lg:py-[7vh]">
        <div className="hidden items-center gap-3 text-white/90 lg:flex"><span className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-white/10"><ShieldCheck className="h-5 w-5" /></span><span className="text-xs font-bold uppercase tracking-[.2em]">Secure Finance Access</span></div>
        <div className="relative grid h-44 w-44 place-items-center rounded-full border-2 border-[#d7ad37] bg-white/95 shadow-[0_24px_70px_-20px_rgba(0,0,0,.75)] ring-[18px] ring-[#005437]/80 sm:h-52 sm:w-52 lg:ml-[18%] lg:h-64 lg:w-64 lg:ring-[26px]">
          <span className="absolute -inset-8 rounded-full border border-[#e3bb42]/75" aria-hidden="true" />
          <img src="/assets/images/bcb-logo.png" alt="Bawjiase Community Bank PLC — Leaders in Innovation" className="h-[88%] w-[88%] rounded-full object-contain" />
        </div>
        <p className="mt-4 text-[10px] font-bold uppercase tracking-[.28em] text-[#f4cf66] lg:hidden">Leaders in Innovation</p>
        <div className="hidden max-w-md text-white lg:block">
          <div className="mb-3 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl border border-[#e8bd41]/70 text-[#f2c94c]"><Check className="h-6 w-6" /></span><div><p className="font-display text-xl font-bold">Building stronger communities, together.</p></div></div>
          <p className="pl-[3.75rem] text-sm leading-6 text-white/80">At Bawjiase Community Bank, we are committed to secure, transparent and community-focused financial solutions.</p>
          <div className="ml-[3.75rem] mt-4 h-0.5 w-14 bg-[#e4b83c]" />
        </div>
      </div>
    </section>
  );
}

export default function AuthLayout({ children, className }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-background lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(31rem,.92fr)]">
      <img src="/assets/images/auth-bg.jpg" alt="" aria-hidden="true" className="fixed inset-0 h-full w-full scale-105 object-cover opacity-30 blur-[4px]" />
      <button type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} className="fixed right-4 top-4 z-50 grid h-10 w-10 place-items-center rounded-full border border-border bg-card/85 text-primary shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-card lg:right-7 lg:top-7">
        {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
      </button>
      <BrandPanel />
      <section className="relative -mt-10 flex min-w-0 min-h-[calc(100dvh-17rem)] items-start justify-center px-4 pb-8 pt-0 sm:px-7 lg:mt-0 lg:min-h-[100dvh] lg:items-center lg:px-8 lg:py-5">
        <div className="absolute inset-0 bg-background/82 backdrop-blur-[3px] dark:bg-background/88" />
        <div className={cn("relative z-10 min-w-0 w-full max-w-[calc(100vw-2rem)] overflow-visible rounded-[1.4rem] border border-primary/10 bg-card/95 px-6 pb-7 pt-16 shadow-[0_24px_70px_-28px_rgba(0,55,35,.45)] backdrop-blur-2xl dark:border-primary/20 dark:bg-card/94 lg:max-w-md", className)}>
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#d4a92d]/80 to-transparent" />
          <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2"><LogoBadge /></div>
          {children}
        </div>
      </section>
    </main>
  );
}
