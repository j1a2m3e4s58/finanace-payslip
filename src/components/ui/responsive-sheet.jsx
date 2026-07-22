import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

/**
 * One accessible overlay for phone bottom sheets and desktop side drawers.
 * Radix provides focus trapping, Escape handling, focus restoration and
 * document scroll locking. The responsive classes only control presentation.
 */
export default function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = '',
  returnFocusRef = null,
}) {
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (wasOpen.current && !open) {
      window.requestAnimationFrame(() => returnFocusRef?.current?.focus());
    }
    wasOpen.current = open;
  }, [open, returnFocusRef]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="responsive"
        className={`flex flex-col overflow-hidden p-0 ${className}`}
      >
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-16 text-left sm:px-6">
          <SheetTitle className="font-heading text-xl font-bold sm:text-2xl">{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
