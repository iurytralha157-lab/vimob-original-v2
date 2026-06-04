import { useState } from 'react';
import { Table, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { TableStats } from '@/hooks/use-database-stats';

interface TablesBreakdownProps {
  tables: TableStats[];
  totalDatabaseBytes: number;
}

type SortField = 'name' | 'size_bytes' | 'estimated_rows';
type SortDirection = 'asc' | 'desc';

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString('pt-BR');
}

export function TablesBreakdown({ tables, totalDatabaseBytes }: TablesBreakdownProps) {
  const [sortField, setSortField] = useState<SortField>('size_bytes');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedTables = [...tables].sort((a, b) => {
    const modifier = sortDirection === 'asc' ? 1 : -1;
    if (sortField === 'name') {
      return a.name.localeCompare(b.name) * modifier;
    }
    return (a[sortField] - b[sortField]) * modifier;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1" /> 
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Table className="h-4 w-4" />
          Tabelas por Tamanho
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          Top 15 tabelas
        </span>
      </CardHeader>
      <CardContent>
        <UITable>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 -ml-2 font-medium"
                  onClick={() => handleSort('name')}
                >
                  Tabela
                  <SortIcon field="name" />
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 -mr-2 font-medium"
                  onClick={() => handleSort('size_bytes')}
                >
                  Tamanho
                  <SortIcon field="size_bytes" />
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 -mr-2 font-medium"
                  onClick={() => handleSort('estimated_rows')}
                >
                  Registros
                  <SortIcon field="estimated_rows" />
                </Button>
              </TableHead>
              <TableHead className="text-right w-24">% BD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTables.map((table) => {
              const percentage = (table.size_bytes / totalDatabaseBytes) * 100;
              return (
                <TableRow key={table.name}>
                  <TableCell className="font-mono text-sm">
                    {table.name}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {table.size_pretty}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatNumber(table.estimated_rows)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Progress value={percentage} className="w-12 h-1.5" />
                      <span className="text-xs text-muted-foreground w-10">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </UITable>
      </CardContent>
    </Card>
  );
}
