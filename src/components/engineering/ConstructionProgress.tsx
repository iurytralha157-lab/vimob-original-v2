import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ConstructionProgressProps {
  value: number;
  label?: string;
  showValue?: boolean;
  className?: string;
  variant?: 'physical' | 'financial';
}

export function ConstructionProgress({ 
  value, 
  label, 
  showValue = true, 
  className,
  variant = 'physical'
}: ConstructionProgressProps) {
  const colorClass = variant === 'physical' ? 'bg-sky-500' : 'bg-emerald-500';
  
  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || showValue) && (
        <div className="flex justify-between items-center text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
          <span>{label}</span>
          {showValue && <span>{Math.round(value)}%</span>}
        </div>
      )}
      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
        <div 
          className={cn("h-full transition-all duration-500", colorClass)}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
