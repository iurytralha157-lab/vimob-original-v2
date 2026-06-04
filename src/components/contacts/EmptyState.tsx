import { Button } from '@/components/ui/button';
import { Users, Upload, Plus } from 'lucide-react';

interface EmptyStateProps {
  hasActiveFilters: boolean;
  onImport: () => void;
  onCreate: () => void;
  onClearFilters: () => void;
}

export function EmptyState({ 
  hasActiveFilters, 
  onImport, 
  onCreate,
  onClearFilters 
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="rounded-full bg-primary/10 p-6">
        <Users className="h-12 w-12 text-primary" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-lg">Nenhum contato encontrado</h3>
        <p className="text-muted-foreground text-sm max-w-sm mt-1">
          {hasActiveFilters
            ? 'Tente ajustar os filtros para encontrar mais resultados.'
            : 'Comece importando uma planilha ou criando seu primeiro contato.'}
        </p>
      </div>
      <div className="flex gap-3 mt-2">
        {hasActiveFilters ? (
          <Button variant="outline" onClick={onClearFilters}>
            Limpar filtros
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onImport}>
              <Upload className="h-4 w-4 mr-2" />
              Importar Contatos
            </Button>
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Contato
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
