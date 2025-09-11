-- Create COGS table for Cost of Goods Sold tracking
CREATE TABLE public.product_cogs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  asin TEXT NOT NULL,
  sku TEXT,
  currency TEXT NOT NULL DEFAULT 'BRL',
  
  -- Cost components
  wholesale_cost DECIMAL(10,2) DEFAULT 0.00,
  inspection_cost DECIMAL(10,2) DEFAULT 0.00,
  region_shipping_cost DECIMAL(10,2) DEFAULT 0.00,
  import_tax_cost DECIMAL(10,2) DEFAULT 0.00,
  other_product_costs DECIMAL(10,2) DEFAULT 0.00,
  inbound_shipping_cost DECIMAL(10,2) DEFAULT 0.00,
  
  -- Calculated total
  total_cogs DECIMAL(10,2) GENERATED ALWAYS AS (
    wholesale_cost + inspection_cost + region_shipping_cost + 
    import_tax_cost + other_product_costs + inbound_shipping_cost
  ) STORED,
  
  -- Period tracking
  cost_period_start DATE NOT NULL DEFAULT CURRENT_DATE,
  cost_period_end DATE,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.product_cogs ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own COGS" 
ON public.product_cogs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own COGS" 
ON public.product_cogs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own COGS" 
ON public.product_cogs 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own COGS" 
ON public.product_cogs 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_product_cogs_user_asin ON public.product_cogs(user_id, asin);
CREATE INDEX idx_product_cogs_user_sku ON public.product_cogs(user_id, sku);
CREATE INDEX idx_product_cogs_period ON public.product_cogs(cost_period_start, cost_period_end);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_product_cogs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_product_cogs_updated_at
  BEFORE UPDATE ON public.product_cogs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_cogs_updated_at();