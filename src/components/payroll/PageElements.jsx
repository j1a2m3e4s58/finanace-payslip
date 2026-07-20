import React from 'react';
import { Search } from 'lucide-react';

export function PageHeader({ eyebrow = 'Finance workspace', title, description, actions = null }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="page-kicker">{eyebrow}</p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-foreground lg:text-3xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto [&>a]:flex-1 [&>button]:flex-1 sm:[&>a]:flex-none sm:[&>button]:flex-none">{actions}</div>}
    </div>
  );
}

export function PrimaryButton({ children, className = '', ...props }) {
  return <button className={`inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props}>{children}</button>;
}

export function SecondaryButton({ children, className = '', ...props }) {
  return <button className={`inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted ${className}`} {...props}>{children}</button>;
}

export function SearchBox({ value, onChange, placeholder = 'Search...' }) {
  return <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/25" /></div>;
}

export function StatusBadge({ status }) {
  const tone = ['Active', 'Ready', 'Completed', 'Delivered', 'Opened', 'Approved', 'Generated', 'Sent', 'Payslips Sent'].includes(status)
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : ['Failed', 'Bounced', 'Inactive', 'Disabled', 'Cancelled', 'Rejected', 'Not Configured'].includes(status)
      ? 'bg-red-500/10 text-red-600 dark:text-red-400'
      : 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
  return <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{status}</span>;
}

export function EmptyHint({ children }) {
  return <p className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-muted-foreground">{children}</p>;
}
