import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
// import { useAuth } from '@clerk/clerk-react';
import { toast } from '@/hooks/use-toast';
import { Calculator, Save, Package, FileCheck, Truck, Receipt, Percent, DollarSign } from 'lucide-react';

type COGSModalProps = {
  isOpen: boolean;
  onClose: () => void;
  asin: string;
  sku?: string;
  productTitle: string;
  revenue?: number;
};

type COGSData = {
  compra: number;
  armazenagem: number;
  frete_amazon: number;
  imposto_percentual: number; // percentual
  receita_bruta: number;
  margem_contribuicao_percentual: number; // percentual
  custo_variavel_percentual: number; // percentual
  comissao_amazon: number; // automático
  logistica_amazon: number; // automático
  acos: number; // automático
  percentual_lucro: number;
  // campos calculados
  imposto_valor: number;
  margem_contribuicao_valor: number;
  custo_variavel_valor: number;
};

export function COGSModal({ isOpen, onClose, asin, sku, productTitle, revenue = 0 }: COGSModalProps) {
  // const { userId } = useAuth();
  const userId = 'default-user'; // Temporary until Clerk is configured
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cogsData, setCOGSData] = useState<COGSData>({
    compra: 0,
    armazenagem: 0,
    frete_amazon: 0,
    imposto_percentual: 0,
    receita_bruta: revenue,
    margem_contribuicao_percentual: 0,
    custo_variavel_percentual: 0,
    comissao_amazon: 0,
    logistica_amazon: 8.00,
    acos: 0,
    percentual_lucro: 0,
    imposto_valor: 0,
    margem_contribuicao_valor: 0,
    custo_variavel_valor: 0,
  });

  useEffect(() => {
    if (isOpen && userId) {
      loadExistingCOGS();
    }
  }, [isOpen, asin, userId]);

  useEffect(() => {
    setCOGSData(prev => calculateValues({ ...prev, receita_bruta: revenue }));
  }, [revenue]);

  const calculateValues = (data: COGSData): COGSData => {
    // Calcular valores baseados em percentuais
    const imposto_valor = (data.imposto_percentual / 100) * data.receita_bruta;
    const custo_variavel_valor = (data.custo_variavel_percentual / 100) * data.receita_bruta;
    const margem_contribuicao_valor = (data.margem_contribuicao_percentual / 100) * data.receita_bruta;
    
    // Calcular comissão Amazon (15% da receita bruta) - automático
    const comissao_amazon = data.receita_bruta * 0.15;
    
    // Logística Amazon fixa (automático)
    const logistica_amazon = 8.00;
    
    // ACOS automático (pode ser calculado baseado em dados da Amazon API)
    const acos = data.receita_bruta * 0.05; // 5% como exemplo
    
    // Calcular custos totais
    const totalCustos = data.compra + data.armazenagem + data.frete_amazon + 
                       imposto_valor + custo_variavel_valor + comissao_amazon + logistica_amazon + acos;
    
    // Calcular percentual de lucro
    const percentual_lucro = data.receita_bruta > 0 
      ? ((data.receita_bruta - totalCustos) / data.receita_bruta) * 100 
      : 0;
    
    return {
      ...data,
      imposto_valor,
      custo_variavel_valor,
      margem_contribuicao_valor,
      comissao_amazon,
      logistica_amazon,
      acos,
      percentual_lucro
    };
  };

  const loadExistingCOGS = async () => {
    if (!asin) return;
    setIsLoading(true);
    try {
      const resp = await fetch(`/api/products/${encodeURIComponent(asin)}/costs`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (resp.ok) {
        const json = await resp.json();
        const data = json?.costs || json?.product || json;
        if (data) {
          setCOGSData(calculateValues({
            compra: Number(data.compra) || 0,
            armazenagem: Number(data.armazenagem) || 0,
            frete_amazon: Number(data.frete_amazon) || 0,
            imposto_percentual: Number(data.imposto_percent) || 0,
            receita_bruta: Number(revenue) || 0,
            margem_contribuicao_percentual: Number(data.margem_contribuicao_percent) || 0,
            custo_variavel_percentual: Number(data.custo_variavel_percent) || 0,
            comissao_amazon: 0,
            logistica_amazon: 8.00,
            acos: 0,
            percentual_lucro: 0,
            imposto_valor: 0,
            margem_contribuicao_valor: 0,
            custo_variavel_valor: 0,
          }));
        }
      } else if (resp.status !== 404) {
        throw new Error(`Falha ao consultar custos: ${resp.status}`);
      }
    } catch (error) {
      console.error('Error loading COGS:', error);
      toast({
        title: "Erro ao carregar COGS",
        description: "Não foi possível carregar os dados de custo existentes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof COGSData, value: string) => {
    const numericValue = parseFloat(value) || 0;
    const updatedData = { ...cogsData, [field]: numericValue };
    setCOGSData(calculateValues(updatedData));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        sku,
        compra: cogsData.compra,
        armazenagem: cogsData.armazenagem,
        frete_amazon: cogsData.frete_amazon,
        imposto_percent: cogsData.imposto_percentual,
        custo_variavel_percent: cogsData.custo_variavel_percentual,
        margem_contribuicao_percent: cogsData.margem_contribuicao_percentual,
      };

      const resp = await fetch(`/api/products/${encodeURIComponent(asin)}/costs`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Falha ao salvar COGS: ${resp.status} ${txt}`);
      }

      toast({
        title: "COGS salvo com sucesso",
        description: `Percentual de lucro: ${(cogsData.percentual_lucro || 0).toFixed(1)}%`,
      });

      onClose();
    } catch (error) {
      console.error('Error saving COGS:', error);
      toast({
        title: "Erro ao salvar COGS",
        description: "Não foi possível salvar os dados de custo",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const manualFields = [
    { key: 'compra' as const, label: 'Compra (R$)', icon: Package, isPercentual: false },
    { key: 'armazenagem' as const, label: 'Armazenagem (R$)', icon: FileCheck, isPercentual: false },
    { key: 'frete_amazon' as const, label: 'Frete pra Amazon (R$)', icon: Truck, isPercentual: false },
  ];

  const percentualFields = [
    { key: 'imposto_percentual' as const, label: 'Imposto (%)', icon: Receipt },
    { key: 'custo_variavel_percentual' as const, label: 'Custo Variável (%)', icon: DollarSign },
    { key: 'margem_contribuicao_percentual' as const, label: 'Margem de Contribuição (%)', icon: Percent },
  ];

  const automaticFields = [
    { label: 'Comissão Amazon (15%)', value: cogsData.comissao_amazon },
    { label: 'Logística Amazon', value: cogsData.logistica_amazon }
  ];

  const getLucroColor = (percentual: number) => {
    if (percentual >= 20) return 'bg-success text-success-foreground';
    if (percentual >= 10) return 'bg-warning text-warning-foreground';
    return 'bg-destructive text-destructive-foreground';
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Calcular COGS (BRL)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">ASIN:</span>
              <Badge variant="outline">{asin}</Badge>
            </div>
            {sku && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">SKU:</span>
                <Badge variant="outline">{sku}</Badge>
              </div>
            )}
            <div className="text-sm text-muted-foreground">{productTitle}</div>
            <div className="text-sm font-medium text-primary">
              Receita Bruta: R$ {(cogsData.receita_bruta || 0).toFixed(2)}
            </div>
          </div>

          <Separator />

          {/* Manual Fields */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Custos Manuais</h4>
            {manualFields.map((field) => (
              <div key={field.key} className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm">
                  <field.icon className="h-4 w-4" />
                  {field.label}
                </Label>
                <div className="w-24">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cogsData[field.key]}
                    onChange={(e) => handleInputChange(field.key, e.target.value)}
                    className="text-right text-sm"
                    disabled={isLoading}
                  />
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Automatic Fields */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Custos da Amazon (Automático)</h4>
            {automaticFields.map((field, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{field.label}</span>
                <Badge variant="secondary">R$ {(field.value || 0).toFixed(2)}</Badge>
              </div>
            ))}
          </div>

          <Separator />

          {/* Percentual Fields */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Custos Percentuais (% sobre Receita)</h4>
            {percentualFields.map((field) => (
              <div key={field.key} className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm">
                  <field.icon className="h-4 w-4" />
                  {field.label}
                </Label>
                <div className="w-24">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={cogsData[field.key]}
                    onChange={(e) => handleInputChange(field.key, e.target.value)}
                    className="text-right text-sm"
                    disabled={isLoading}
                  />
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* ACOS */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm">ACOS (Automático)</h4>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">ACOS (5%)</span>
              <Badge variant="secondary">R$ {(cogsData.acos || 0).toFixed(2)}</Badge>
            </div>
          </div>

          <Separator />

          {/* Results */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Custo Variável Total:</span>
              <span className="font-medium">R$ {(cogsData.custo_variavel_valor || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Margem de Contribuição:</span>
              <span className="font-medium">R$ {(cogsData.margem_contribuicao_valor || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Percentual de Lucro:</span>
              <Badge className={getLucroColor(cogsData.percentual_lucro || 0)}>
                <Percent className="h-3 w-3 mr-1" />
                {(cogsData.percentual_lucro || 0).toFixed(1)}%
              </Badge>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="flex-1"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Salvando...' : 'Salvar & Fechar'}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}