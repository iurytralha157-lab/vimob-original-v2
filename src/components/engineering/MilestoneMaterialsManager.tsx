import React, { useState } from 'react';
import { 
  Card, 
  CardContent 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  useConstructionMilestones, 
  useUpdateMilestone,
  useCreatePurchaseOrder 
} from "@/hooks/use-construction";
import { 
  ShoppingCart, 
  Plus, 
  CheckCircle2, 
  Package,
  Loader2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface MaterialItem {
  description: string;
  quantity: number;
  unit: string;
}

export function MilestoneMaterialsManager({ projectId }: { projectId: string }) {
  const { data: milestones, isLoading } = useConstructionMilestones(projectId);
  const updateMilestone = useUpdateMilestone();
  const createPurchaseOrder = useCreatePurchaseOrder();
  
  const [selectedMilestone, setSelectedMilestone] = useState<any>(null);
  const [isAddingMaterial, setIsAddingMaterial] = useState(false);
  const [newMaterial, setNewMaterial] = useState<MaterialItem>({
    description: '',
    quantity: 1,
    unit: 'un'
  });

  const handleAddMaterial = async () => {
    if (!selectedMilestone) return;
    
    const currentMaterials = (selectedMilestone as any).material_list || [];
    const updatedMaterials = [...currentMaterials, newMaterial];
    
    await updateMilestone.mutateAsync({
      id: selectedMilestone.id,
      material_list: updatedMaterials
    });
    
    setSelectedMilestone({ ...selectedMilestone, material_list: updatedMaterials });
    setNewMaterial({ description: '', quantity: 1, unit: 'un' });
    setIsAddingMaterial(false);
  };

  const handleGeneratePurchaseOrder = async (milestone: any) => {
    const materials = (milestone as any).material_list || [];
    if (materials.length === 0) {
      toast.error("Nenhum material cadastrado nesta etapa.");
      return;
    }

    try {
      await createPurchaseOrder.mutateAsync({
        project_id: projectId,
        milestone_id: milestone.id,
        description: `Suprimentos para etapa: ${milestone.name}`,
        items: materials.map((m: any) => ({
          description: m.description,
          quantity: m.quantity,
          unit: m.unit
        }))
      });
    } catch (error) {
      console.error(error);
    }
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Suprimentos por Etapa</h3>
          <p className="text-sm text-muted-foreground">Vincule materiais às milestones para automação de compras</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {milestones?.map((milestone) => (
          <Card key={milestone.id} className="hover:border-primary/50 transition-colors">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                    {(milestone as any).order_index}
                  </div>
                  <div>
                    <h4 className="font-medium">{(milestone as any).name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {(milestone as any).material_list?.length || 0} materiais
                      </Badge>
                      {(milestone as any).status === 'completed' && (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => setSelectedMilestone(milestone)}>
                        <Package className="h-4 w-4 mr-2" />
                        Gerenciar Materiais
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle>Materiais: {(milestone as any).name}</DialogTitle>
                        <DialogDescription>
                          Liste os insumos necessários para concluir esta etapa da obra.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 py-4">
                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                          {(milestone as any).material_list?.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                              <span>{item.description}</span>
                              <span className="font-mono">{item.quantity} {item.unit}</span>
                            </div>
                          ))}
                          {(!(milestone as any).material_list || (milestone as any).material_list.length === 0) && (
                            <p className="text-center text-muted-foreground py-4 italic text-sm">Nenhum material adicionado.</p>
                          )}
                        </div>

                        {isAddingMaterial ? (
                          <div className="grid grid-cols-12 gap-2 p-3 border rounded-lg bg-primary/5">
                            <div className="col-span-6 space-y-1">
                              <Label className="text-[10px]">Descrição</Label>
                              <Input 
                                placeholder="Cimento, Tijolo..." 
                                value={newMaterial.description}
                                onChange={e => setNewMaterial({...newMaterial, description: e.target.value})}
                              />
                            </div>
                            <div className="col-span-3 space-y-1">
                              <Label className="text-[10px]">Qtd</Label>
                              <Input 
                                type="number" 
                                value={newMaterial.quantity}
                                onChange={e => setNewMaterial({...newMaterial, quantity: parseFloat(e.target.value)})}
                              />
                            </div>
                            <div className="col-span-3 space-y-1">
                              <Label className="text-[10px]">Und</Label>
                              <Input 
                                placeholder="kg, m3..." 
                                value={newMaterial.unit}
                                onChange={e => setNewMaterial({...newMaterial, unit: e.target.value})}
                              />
                            </div>
                            <div className="col-span-12 flex justify-end gap-2 mt-2">
                              <Button variant="ghost" size="sm" onClick={() => setIsAddingMaterial(false)}>Cancelar</Button>
                              <Button size="sm" onClick={handleAddMaterial}>Salvar</Button>
                            </div>
                          </div>
                        ) : (
                          <Button variant="outline" className="w-full border-dashed" onClick={() => setIsAddingMaterial(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar Insumo
                          </Button>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button 
                    variant="default" 
                    size="sm" 
                    className="bg-purple-600 hover:bg-purple-700"
                    onClick={() => handleGeneratePurchaseOrder(milestone)}
                    disabled={!(milestone as any).material_list || (milestone as any).material_list.length === 0}
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Gerar Compra
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
