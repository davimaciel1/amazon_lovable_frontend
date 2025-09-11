import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calculator, DollarSign, Package, Truck, Receipt, TrendingUp, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface AddCostsModalProps {
  isOpen: boolean;
  onClose: () => void;
  asin: string;
  sku: string;
  productTitle: string;
  onSave?: (data: any) => void;
  initialCosts?: {
    compra?: number | null;
    armazenagem?: number | null;
    frete_amazon?: number | null;
    custos_percentuais?: number | null;
    imposto_percent?: number | null;
    custo_variavel_percent?: number | null;
    margem_contribuicao_percent?: number | null;
  };
}

export function AddCostsModal({
  isOpen,
  onClose,
  asin,
  sku,
  productTitle,
  onSave,
  initialCosts
}: AddCostsModalProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    // Basic Costs
    unit_cost: '',
    packaging_cost: '',
    
    // Amazon Fees
    amazon_referral_fee_percent: '15',
    amazon_fba_fee: '',
    amazon_storage_fee_monthly: '',
    
    // Logistics
    shipping_cost_to_amazon: '',
    
    // Taxes & Variable Costs
    tax_percent: '',
    variable_cost_percent: '',
    contribution_margin_percent: '',
    custos_percentuais: '',
    
    // Marketing & Others
    marketing_cost_monthly: '',
    other_fixed_costs: ''
  });

  useEffect(() => {
    const prefill = async () => {
      if (!isOpen) return;

      if (initialCosts) {
        setFormData(prev => ({
          ...prev,
          unit_cost: initialCosts.compra != null ? String(initialCosts.compra) : prev.unit_cost,
          packaging_cost: initialCosts.armazenagem != null ? String(initialCosts.armazenagem) : prev.packaging_cost,
          shipping_cost_to_amazon: initialCosts.frete_amazon != null ? String(initialCosts.frete_amazon) : prev.shipping_cost_to_amazon,
          tax_percent: initialCosts.imposto_percent != null ? String(initialCosts.imposto_percent) : prev.tax_percent,
          variable_cost_percent: initialCosts.custo_variavel_percent != null ? String(initialCosts.custo_variavel_percent) : prev.variable_cost_percent,
          contribution_margin_percent: initialCosts.margem_contribuicao_percent != null ? String(initialCosts.margem_contribuicao_percent) : prev.contribution_margin_percent,
          custos_percentuais: initialCosts.custos_percentuais != null ? String(initialCosts.custos_percentuais) : prev.custos_percentuais,
        }));
        return;
      }

      // Fallback: fetch from API
      const resp = await api.getProduct(asin);
      const prod = (resp.data && (resp.data as any).product) || null;
      const costs = prod?.costs || prod || null;
      if (costs) {
        setFormData(prev => ({
          ...prev,
          unit_cost: costs.compra != null ? String(costs.compra) : prev.unit_cost,
          packaging_cost: costs.armazenagem != null ? String(costs.armazenagem) : prev.packaging_cost,
          shipping_cost_to_amazon: costs.frete_amazon != null ? String(costs.frete_amazon) : prev.shipping_cost_to_amazon,
          tax_percent: costs.imposto_percent != null ? String(costs.imposto_percent) : prev.tax_percent,
          variable_cost_percent: costs.custo_variavel_percent != null ? String(costs.custo_variavel_percent) : prev.variable_cost_percent,
          contribution_margin_percent: costs.margem_contribuicao_percent != null ? String(costs.margem_contribuicao_percent) : prev.contribution_margin_percent,
          custos_percentuais: costs.custos_percentuais != null ? String(costs.custos_percentuais) : prev.custos_percentuais,
        }));
      }
    };

    prefill();
  }, [isOpen, initialCosts, asin]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const calculateEstimatedCOGS = () => {
    const unitCost = parseFloat(formData.unit_cost) || 0;
    const packagingCost = parseFloat(formData.packaging_cost) || 0;
    const fbaFee = parseFloat(formData.amazon_fba_fee) || 0;
    const shippingCost = parseFloat(formData.shipping_cost_to_amazon) || 0;
    const storageFee = (parseFloat(formData.amazon_storage_fee_monthly) || 0) / 30;
    const marketingDaily = (parseFloat(formData.marketing_cost_monthly) || 0) / 30;
    const otherDaily = (parseFloat(formData.other_fixed_costs) || 0) / 30;
    
    return unitCost + packagingCost + fbaFee + shippingCost + storageFee + marketingDaily + otherDaily;
  };

  const handleSave = async () => {
    try {
      // Validate required fields
      if (!formData.unit_cost) {
        toast({
          title: "Missing Required Field",
          description: "Unit cost is required to calculate profitability",
          variant: "destructive",
        });
        return;
      }

      // Prepare data for API
      const costData = {
        asin,
        sku,
        ...formData,
        // Convert string values to numbers
        unit_cost: parseFloat(formData.unit_cost),
        packaging_cost: parseFloat(formData.packaging_cost) || 0,
        amazon_referral_fee_percent: parseFloat(formData.amazon_referral_fee_percent) || 15,
        amazon_fba_fee: parseFloat(formData.amazon_fba_fee) || 0,
        amazon_storage_fee_monthly: parseFloat(formData.amazon_storage_fee_monthly) || 0,
        shipping_cost_to_amazon: parseFloat(formData.shipping_cost_to_amazon) || 0,
        tax_percent: parseFloat(formData.tax_percent) || 0,
        variable_cost_percent: parseFloat(formData.variable_cost_percent) || 0,
        contribution_margin_percent: parseFloat(formData.contribution_margin_percent) || 0,
        marketing_cost_monthly: parseFloat(formData.marketing_cost_monthly) || 0,
        other_fixed_costs: parseFloat(formData.other_fixed_costs) || 0,
      };

      // Call API to save costs
      const payload = {
        sku,
        compra: parseFloat(formData.unit_cost),
        armazenagem: parseFloat(formData.packaging_cost) || 0,
        frete_amazon: parseFloat(formData.shipping_cost_to_amazon) || 0,
        imposto_percent: parseFloat(formData.tax_percent) || 0,
        custo_variavel_percent: parseFloat(formData.variable_cost_percent) || 0,
        margem_contribuicao_percent: parseFloat(formData.contribution_margin_percent) || 0,
        custos_percentuais: parseFloat(formData.custos_percentuais) || 0,
        custos_manuais: true,
      };

      const API_KEY = (import.meta.env as any).VITE_API_KEY?.trim();
      const response = await fetch(`/api/products/${encodeURIComponent(asin)}/costs`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to save costs');
      }

      toast({
        title: "Costs Saved Successfully",
        description: "Product costs have been updated in Postgres.",
      });

      if (onSave) {
        onSave(costData);
      }

      onClose();
    } catch (error) {
      console.error('Error saving costs:', error);
      toast({
        title: "Error Saving Costs",
        description: "Failed to save product costs. Please try again.",
        variant: "destructive",
      });
    }
  };

  const estimatedCOGS = calculateEstimatedCOGS();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Product Costs</DialogTitle>
          <DialogDescription>
            Configure real costs for accurate profit and ROI calculations
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Product Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Product Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">ASIN:</span>
                  <span className="ml-2 font-mono">{asin}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">SKU:</span>
                  <span className="ml-2 font-mono">{sku}</span>
                </div>
                <div className="col-span-3">
                  <span className="text-muted-foreground">Product:</span>
                  <span className="ml-2">{productTitle}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cost Input Tabs */}
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Costs</TabsTrigger>
              <TabsTrigger value="amazon">Amazon Fees</TabsTrigger>
              <TabsTrigger value="taxes">Taxes & Variables</TabsTrigger>
              <TabsTrigger value="marketing">Marketing & Others</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Product Costs
                  </CardTitle>
                  <CardDescription>
                    Direct costs related to the product
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="unit_cost">
                        Unit Cost <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="unit_cost"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.unit_cost}
                        onChange={(e) => handleInputChange('unit_cost', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Cost per unit from supplier
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="packaging_cost">Packaging Cost</Label>
                      <Input
                        id="packaging_cost"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.packaging_cost}
                        onChange={(e) => handleInputChange('packaging_cost', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Cost per unit for packaging
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="amazon" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Amazon Fees
                  </CardTitle>
                  <CardDescription>
                    Fees charged by Amazon for selling and fulfillment
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amazon_referral_fee_percent">Referral Fee (%)</Label>
                      <Input
                        id="amazon_referral_fee_percent"
                        type="number"
                        step="0.1"
                        placeholder="15"
                        value={formData.amazon_referral_fee_percent}
                        onChange={(e) => handleInputChange('amazon_referral_fee_percent', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Usually 15% of sale price
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="amazon_fba_fee">FBA Fee per Unit</Label>
                      <Input
                        id="amazon_fba_fee"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.amazon_fba_fee}
                        onChange={(e) => handleInputChange('amazon_fba_fee', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Fulfillment fee per unit
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="amazon_storage_fee_monthly">Storage Fee (Monthly)</Label>
                      <Input
                        id="amazon_storage_fee_monthly"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.amazon_storage_fee_monthly}
                        onChange={(e) => handleInputChange('amazon_storage_fee_monthly', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Total monthly storage cost
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shipping_cost_to_amazon">Shipping to Amazon</Label>
                      <Input
                        id="shipping_cost_to_amazon"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.shipping_cost_to_amazon}
                        onChange={(e) => handleInputChange('shipping_cost_to_amazon', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Cost per unit to ship to FBA
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="taxes" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Taxes & Variable Costs
                  </CardTitle>
                  <CardDescription>
                    Tax obligations and variable cost percentages
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tax_percent">Tax Rate (%)</Label>
                      <Input
                        id="tax_percent"
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        value={formData.tax_percent}
                        onChange={(e) => handleInputChange('tax_percent', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Total tax rate (ICMS, PIS, COFINS)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="variable_cost_percent">Variable Costs (%)</Label>
                      <Input
                        id="variable_cost_percent"
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        value={formData.variable_cost_percent}
                        onChange={(e) => handleInputChange('variable_cost_percent', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Other variable costs as % of revenue
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custos_percentuais">Custos Percentuais (% sobre Receita)</Label>
                      <Input
                        id="custos_percentuais"
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        value={formData.custos_percentuais}
                        onChange={(e) => handleInputChange('custos_percentuais', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Percentual de custos diversos incidindo sobre a receita
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contribution_margin_percent">Target Contribution Margin (%)</Label>
                      <Input
                        id="contribution_margin_percent"
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        value={formData.contribution_margin_percent}
                        onChange={(e) => handleInputChange('contribution_margin_percent', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Desired contribution margin
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="marketing" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Marketing & Other Costs
                  </CardTitle>
                  <CardDescription>
                    Marketing investments and other fixed costs
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="marketing_cost_monthly">Marketing (Monthly)</Label>
                      <Input
                        id="marketing_cost_monthly"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.marketing_cost_monthly}
                        onChange={(e) => handleInputChange('marketing_cost_monthly', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Total monthly marketing spend
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="other_fixed_costs">Other Fixed Costs (Monthly)</Label>
                      <Input
                        id="other_fixed_costs"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formData.other_fixed_costs}
                        onChange={(e) => handleInputChange('other_fixed_costs', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Other monthly fixed costs
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Estimated COGS Summary */}
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Estimated COGS per Unit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                ${estimatedCOGS.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Based on the costs entered above (excluding % based fees)
              </p>
            </CardContent>
          </Card>

          {/* Info Alert */}
          <div className="flex items-start gap-2 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-900 dark:text-blue-100">
              <p className="font-semibold mb-1">Important:</p>
              <p>After saving, refresh the page to see updated profit and ROI calculations based on these real costs.</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formData.unit_cost}>
              Save Costs
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}