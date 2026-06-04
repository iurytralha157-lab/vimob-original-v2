
import React, { useEffect, useState } from 'react';
import { performanceTracker, PerformanceMetric } from '@/lib/performance';
import { Activity, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const MetricsPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const updateMetrics = () => {
      setMetrics(performanceTracker.getMetrics());
    };

    updateMetrics();
    window.addEventListener('performance-metric-added', updateMetrics);
    
    return () => {
      window.removeEventListener('performance-metric-added', updateMetrics);
    };
  }, []);

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-4 right-4 z-50 rounded-full shadow-lg bg-background"
        onClick={() => setIsOpen(true)}
      >
        <Activity className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80">
      <Card className="shadow-2xl border-primary/20 bg-background/95 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Métricas de Performance
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="py-0 pb-4 max-h-80 overflow-y-auto">
          <div className="space-y-3">
            {metrics.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma métrica coletada ainda.</p>
            ) : (
              metrics.map((metric, index) => (
                <div key={`${metric.name}-${index}`} className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">{metric.name}</span>
                  <span className={cn(
                    "font-mono font-medium",
                    metric.value > 1000 ? "text-destructive" : metric.value > 500 ? "text-warning" : "text-success"
                  )}>
                    {metric.value}{metric.unit}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
