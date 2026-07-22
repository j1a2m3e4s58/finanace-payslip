import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';

export default function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'warning',
  value = '',
  onValueChange = undefined,
  inputLabel = '',
  inputType = 'text',
  inputPlaceholder = '',
  required = false,
  confirmDisabled = false,
  busy = false,
  onConfirm,
  onClose,
  children = null,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => (inputRef.current || dialogRef.current?.querySelector('button:not([disabled])'))?.focus(), 30);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose?.();
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, busy, onClose]);

  if (!open) return null;
  const blocked = busy || confirmDisabled || (required && !String(value).trim());
  const destructive = tone === 'danger';

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose?.(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="w-full max-w-md rounded-t-[1.5rem] border border-border bg-card p-5 shadow-2xl sm:rounded-[1.5rem] sm:p-6">
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${destructive ? 'bg-red-500/10 text-red-600' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
            {destructive ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-heading text-xl font-bold text-foreground">{title}</h2>
            <p id={descriptionId} className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Close dialog"><X className="h-5 w-5" /></button>
        </div>

        {inputLabel && <label className="mt-5 block text-sm font-semibold text-foreground">{inputLabel}
          {inputType === 'textarea'
            ? <textarea ref={inputRef} value={value} onChange={(event) => onValueChange?.(event.target.value)} placeholder={inputPlaceholder} className="mt-2 min-h-28 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
            : <input ref={inputRef} type={inputType} value={value} onChange={(event) => onValueChange?.(event.target.value)} placeholder={inputPlaceholder} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />}
        </label>}
        {children && <div className="mt-5">{children}</div>}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50">{cancelLabel}</button>
          <button type="button" onClick={onConfirm} disabled={blocked} className={`min-h-11 rounded-xl px-5 text-sm font-bold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:brightness-95'}`}>{busy ? 'Please wait…' : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
