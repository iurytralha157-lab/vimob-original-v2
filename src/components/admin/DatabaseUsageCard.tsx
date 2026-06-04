import { Database, Settings2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DatabaseUsageCardProps {
  currentBytes: number;
  currentPretty: string;
  limitGB?: number;
  onConfigureLimit?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getThresholdColor(percentage: number): string {
  if (percentage >= 95) return 'text-destructive';
  if (percentage >= 85) return 'text-orange-500';
  if (percentage >= 70) return 'text-yellow-500';
  return 'text-green-500';
}

function getProgressColor(percentage: number): string {
  if (percentage >= 95) return 'bg-destructive';
  if (percentage >= 85) return 'bg-orange-500';
  if (percentage >= 70) return 'bg-yellow-500';
  return 'bg-green-500';
}

export function DatabaseUsageCard({ 
  currentBytes, 
  currentPretty, 
  limitGB = 8,
  onConfigureLimit 
}: DatabaseUsageCardProps) {
  const limitBytes = limitGB * 1024 * 1024 * 1024;
  const percentage = Math.min((currentBytes / limitBytes) * 100, 100);
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Banco de Dados</CardTitle>
        <Database className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <div className={cn("text-2xl font-bold", getThresholdColor(percentage))}>
              {currentPretty}
            </div>
            <div className="text-sm text-muted-foreground">
              / {limitGB} GB
            </div>
          </div>
          
          <div className="space-y-2">
            <Progress 
              value={percentage} 
              className="h-2"
              // @ts-expect-error - custom styling
              indicatorClassName={getProgressColor(percentage)}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{percentage.toFixed(1)}% usado</span>
              <span>{formatBytes(limitBytes - currentBytes)} livre</span>
            </div>
          </div>

          {onConfigureLimit && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-xs"
              onClick={onConfigureLimit}
            >
              <Settings2 className="h-3 w-3 mr-1" />
              Configurar limite
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
