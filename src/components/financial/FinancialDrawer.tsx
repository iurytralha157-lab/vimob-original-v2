import { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface FinancialDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Wider drawer for forms with many columns/tabs (e.g. contracts) */
  size?: "default" | "lg";
}

/**
 * Standardized side drawer used across the financial module.
 *
 * - Slides from the right
 * - 480px on desktop (640px when size="lg"), full width on mobile
 * - Dark surface (uses theme tokens — no hardcoded colors)
 * - Sticky header, scrollable body
 */
export function FinancialDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "default",
}: FinancialDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex w-full flex-col gap-0 border-l border-border bg-background p-0",
          size === "lg"
            ? "sm:max-w-[640px]"
            : "sm:max-w-[480px]",
        )}
      >
        <SheetHeader className="sticky top-0 z-10 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SheetTitle className="text-left text-base font-semibold text-foreground">
            {title}
          </SheetTitle>
          {description && (
            <SheetDescription className="text-left text-xs text-muted-foreground">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
