import { cn } from "@/lib/utils";

interface ChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  title?: string;
  valueFormatter?: (value: any, entry?: any) => string;
  nameFormatter?: (name: string, entry?: any) => string;
  className?: string;
  showTotal?: boolean;
}

export function DashboardChartTooltip({ 
  active, 
  payload, 
  label, 
  title, 
  valueFormatter, 
  nameFormatter,
  className,
  showTotal = false
}: ChartTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const displayTitle = title || label;

  return (
    <div className={cn(
      "bg-popover/95 backdrop-blur-md border border-border rounded-xl p-3 shadow-xl animate-in fade-in zoom-in duration-200 min-w-[140px]",
      className
    )}>
      {displayTitle && (
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
          {displayTitle}
        </p>
      )}
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: entry.color || entry.fill }}
              />
              <span className="text-xs text-muted-foreground font-extralight py-0 pb-0 pt-[2px]">
                {nameFormatter ? nameFormatter(entry.name, entry) : entry.name}
              </span>
            </div>
            <span className="text-xs font-bold text-foreground tabular-nums pt-[2px] font-extralight">
              {valueFormatter ? valueFormatter(entry.value, entry) : entry.value}
            </span>
          </div>
        ))}
        
        {showTotal && payload.length > 1 && (
          <div className="pt-1.5 mt-1.5 border-t border-border flex items-center justify-between gap-4">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total</span>
            <span className="text-xs font-black text-foreground tabular-nums">
              {payload.reduce((acc, entry) => acc + (Number(entry.value) || 0), 0)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
