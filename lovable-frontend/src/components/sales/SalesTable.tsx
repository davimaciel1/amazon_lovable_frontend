
import { useMemo, useState, useEffect } from 'react';
import { 
  useReactTable, 
  getCoreRowModel, 
  getSortedRowModel,
  ColumnDef,
  flexRender,
  SortingState
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowUpDown, ArrowUp, ArrowDown, Calculator, TrendingUp, Layers, Bug, ChevronDown, ChevronUp, Wrench } from 'lucide-react';
import { SalesRow, SalesResponse, debugSalesData } from '@/lib/db/adapter';
import { formatCurrency, formatPercentage, formatNumber } from '@/lib/filters';
import { useSalesStore, ColumnVisibility, GroupByMode } from '@/stores/salesStore';
import { HealthBadge } from './HealthBadge';
import { COGSModal } from './COGSModal';
import { TrendingModal } from './TrendingModal';
import { AddCostsModal } from './AddCostsModal';
import { MarketplaceFlag } from './MarketplaceFlag';
import { MarketplaceLogo } from './MarketplaceLogo';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

type SalesTableProps = {
  data?: SalesResponse;
  isLoading: boolean;
  filters: any;
  onFiltersChange: (filters: any) => void;
};

export function SalesTable({ data, isLoading, filters, onFiltersChange }: SalesTableProps) {
  const { columnVisibility, settings, setSettings } = useSalesStore();
  const [showDebug, setShowDebug] = useState(false);
  
  // Debug data on initial load or data change
  useEffect(() => {
    if (data && import.meta.env.DEV) {
      debugSalesData(data, 'SalesTable Received Data');
    }
  }, [data]);

  // ---- Aggregation & totals (frontend safety belt) ----
  type AnyRow = Record<string, any>;

  const groupByMode = settings.groupByMode || 'asin';

  const groupedRows = useMemo<SalesRow[]>(() => {
    const map = new Map<string, SalesRow & { _revW?: number }>();

    for (const r of (data?.rows ?? []) as AnyRow[]) {
      const asin = r.asin || r.ASIN || 'N/A';
      const sku  = r.sku ?? r.SKU ?? null;
      const marketplaceId = r.marketplace_id ?? r.marketplaceId ?? null;
      
      // For orders without ASIN (when backend returns "N/A" due to rate limiting),
      // use the order ID as fallback to avoid grouping all orders together
      const orderId = r.id || r.amazon_order_id || `row-${Math.random()}`;

      let key: string;
      if (asin === 'N/A') {
        // When ASIN is N/A, use order ID to prevent incorrect aggregation
        key = groupByMode === 'asin_marketplace'
          ? `order:${orderId}:${marketplaceId ?? 'UNKNOWN'}`
          : groupByMode === 'sku' && sku
            ? `${sku}`
            : `order:${orderId}`;
      } else {
        // Normal grouping when ASIN is available
        key = groupByMode === 'asin_marketplace'
          ? `${marketplaceId ?? 'UNKNOWN'}:${asin}`
          : groupByMode === 'sku'
            ? `${sku ?? asin}`
            : asin;
      }

      const curr =
        map.get(key) ??
        ({
          id: r.id || key,  // Use original ID if available, otherwise use the aggregation key
          asin,
          sku,
          title: r.title ?? r.Title ?? 'Product',
          image_url: r.image_url ?? r.imageUrl ?? null,
          imageUrl: r.imageUrl ?? r.image_url ?? null, // compat
          marketplace_id: marketplaceId,
          stock: r.stock ?? 0,
          buy_box_winner: r.buy_box_winner ?? r.buyBox ?? null,
          sellers: r.sellers ?? 1,
          units: 0,
          revenue: 0,
          profit: 0 as number | null,
          roi: null as number | null,
          acos: null as number | null,
          health: r.health ?? null,
        } as SalesRow & { _revW?: number });

      const units = Number(r.units ?? r.quantity ?? 0);
      const revenue = Number(r.revenue ?? r.item_total ?? r.price ?? 0);
      curr.units += units;
      curr.revenue += revenue;

      const rowProfit = r.profit;
      if (rowProfit === null || rowProfit === undefined) {
        curr.profit = null; // mantém "Add costs" habilitado
      } else if (curr.profit !== null) {
        curr.profit += Number(rowProfit);
      }

      // ACOS ponderado por receita
      if (r.acos !== null && r.acos !== undefined && revenue > 0) {
        const w = curr._revW ?? 0;
        const prevWeighted = (curr.acos ?? 0) * w;
        curr._revW = w + revenue;
        curr.acos = (prevWeighted + Number(r.acos) * revenue) / curr._revW;
      }

      // ROI - manter null se não houver dados
      if (r.roi !== null && r.roi !== undefined) {
        curr.roi = r.roi; // Usar último valor ou fazer média ponderada
      }

      // Preserve metadata from first row with data
      if (!curr.title && r.title) curr.title = r.title;
      if (!curr.image_url && (r.image_url || r.imageUrl))
        curr.image_url = r.image_url || r.imageUrl;
      if (!curr.imageUrl && (r.imageUrl || r.image_url))
        curr.imageUrl = r.imageUrl || r.image_url;
      if (!curr.marketplace_id && marketplaceId)
        curr.marketplace_id = marketplaceId;
      if (r.health) curr.health = r.health;

      map.set(key, curr);
    }

    return Array.from(map.values()).map((row) => {
      delete (row as any)._revW;
      return row;
    });
  }, [data?.rows, groupByMode]);

  const computedTotalRow = useMemo(() => {
    if (data?.totalRow) return data.totalRow;

    const t = {
      units: 0,
      revenue: 0,
      profit: 0 as number | null,
      roi: null as number | null,
      acos: null as number | null,
    };

    let w = 0;
    let acosWeighted = 0;

    for (const r of groupedRows) {
      t.units += Number(r.units || 0);
      t.revenue += Number(r.revenue || 0);

      if (r.profit === null || r.profit === undefined) {
        t.profit = null;
      } else if (t.profit !== null) {
        t.profit += Number(r.profit);
      }

      if (typeof r.acos === 'number' && r.revenue > 0) {
        acosWeighted += r.acos * r.revenue;
        w += r.revenue;
      }
    }

    if (w > 0) t.acos = acosWeighted / w;
    // ROI total depende do COGS total; manter null se não houver
    return t;
  }, [groupedRows, data?.totalRow]);
  
  const [cogsModal, setCOGSModal] = useState<{
    isOpen: boolean;
    asin: string;
    sku?: string;
    title: string;
  }>({
    isOpen: false,
    asin: '',
    sku: '',
    title: '',
  });

  const [trendingModal, setTrendingModal] = useState<{
    isOpen: boolean;
    asin: string;
    sku?: string;
    title: string;
  }>({
    isOpen: false,
    asin: '',
    sku: '',
    title: '',
  });

  const [addCostsModal, setAddCostsModal] = useState<{
    isOpen: boolean;
    asin: string;
    sku?: string;
    title: string;
  }>({
    isOpen: false,
    asin: '',
    sku: '',
    title: '',
  });

  const openCOGSModal = (asin: string, sku?: string, title?: string) => {
    setCOGSModal({
      isOpen: true,
      asin,
      sku,
      title: title || 'Product',
    });
  };

  const closeCOGSModal = () => {
    setCOGSModal(prev => ({ ...prev, isOpen: false }));
  };

  const openTrendingModal = (asin: string, sku?: string, title?: string) => {
    setTrendingModal({
      isOpen: true,
      asin,
      sku,
      title: title || 'Product',
    });
  };

  const closeTrendingModal = () => {
    setTrendingModal(prev => ({ ...prev, isOpen: false }));
  };

  const openAddCostsModal = (asin: string, sku?: string, title?: string) => {
    setAddCostsModal({
      isOpen: true,
      asin,
      sku: sku || '',
      title: title || '',
    });
  };

  const closeAddCostsModal = () => {
    setAddCostsModal(prev => ({ ...prev, isOpen: false }));
  };

  const columns = useMemo<ColumnDef<SalesRow>[]>(() => [
    {
      id: 'image',
      header: () => <div className="text-left font-semibold">PRODUCT</div>,
      cell: ({ row }) => {
        const title = row.original.title;
        // Get image URL from backend - try both field names
        const rawImageUrl = row.original.imageUrl || row.original.image_url || null;
        
        // Construct absolute image URL against backend origin
        let imageUrl = rawImageUrl;
        // Derive backend origin from API base (e.g., http://localhost:8080/api -> http://localhost:8080)
        const apiBase = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8080/api';
        const backendOrigin = apiBase.replace(/\/?api\/?$/, '');

        if (rawImageUrl) {
          if (rawImageUrl.startsWith('http')) {
            // If it's an Amazon CDN URL, go through backend proxy to avoid CORS
            if (rawImageUrl.includes('amazon.com') || rawImageUrl.includes('media-amazon.com')) {
              imageUrl = `${apiBase}/image-proxy?url=${encodeURIComponent(rawImageUrl)}`;
            } else {
              imageUrl = rawImageUrl;
            }
          } else {
            // Relative paths: route through /app proxy so backend can dynamically fetch/placeholder when local file is missing
            if (rawImageUrl.startsWith('/app/') || rawImageUrl.startsWith('/api/')) {
              imageUrl = rawImageUrl; // already proxied paths - don't double-prefix!
            } else if (rawImageUrl.startsWith('/product-images/')) {
              imageUrl = `/app${rawImageUrl}`;
            } else {
              // Any other relative path — prefix with backend origin as a fallback
              imageUrl = `${backendOrigin}${rawImageUrl.startsWith('/') ? '' : '/'}${rawImageUrl}`;
            }
          }
        }

        // Fallback: generate image URL from ASIN if backend didn't send one
        if (!imageUrl && row.original.asin) {
          try {
            const encoded = btoa(row.original.asin);
            imageUrl = `${backendOrigin}/app/product-images/${encoded}.jpg`;
          } catch {}
        }
        
        // Debug: Log image URL to see what we're getting
        if (row.original.asin && !imageUrl) {
          console.warn(`No image URL for ASIN ${row.original.asin}:`, row.original);
        } else if (imageUrl) {
          console.log(`Image URL for ${row.original.asin}:`, imageUrl);
        }
        
        // Determine marketplace based on real marketplace_id from database
        // ATVPDKIKX0DER = Amazon US → Show USA flag 🇺🇸
        // A2Q3Y263D00KWC = Amazon BR → Show Brazil flag 🇧🇷
        // MLB = Mercado Livre Brasil → Show Brazil flag 🇧🇷
        const marketplaceId = row.original.marketplace_id || 'ATVPDKIKX0DER';
        let marketplace: 'brazil' | 'usa';
        
        if (marketplaceId === 'ATVPDKIKX0DER') {
          marketplace = 'usa';  // Amazon US → USA flag
        } else if (marketplaceId === 'A2Q3Y263D00KWC' || marketplaceId === 'MLB') {
          marketplace = 'brazil';  // Amazon BR or Mercado Livre Brasil → Brazil flag
        } else {
          marketplace = 'usa';  // Default to USA for any other marketplace
        }
let marketplaceType: 'amazon' | 'mercadolivre' = 'amazon';
        if (typeof marketplaceId === 'string' && marketplaceId.toUpperCase().startsWith('ML')) {
          marketplaceType = 'mercadolivre';
        }
        
        // Use REAL data from database - NO MOCK VALUES!
        const stock = row.original.stock || 0;  // Real stock from database
        const buyBox = row.original.buy_box_winner || 'Unknown';  // Real buy box winner
        const sellers = row.original.sellers || 1;  // Real seller count from database
        
        // Generate product URL based on marketplace
const getProductUrl = (asin: string, marketplace: string, marketplaceType: string) => {
          // Basic external links per marketplace
          if (marketplaceType === 'mercadolivre') {
            // We may not have exact product URL; link to search by ID as fallback
            return `https://www.mercadolivre.com.br/jm/search?as_word=${encodeURIComponent(asin)}`;
          }
          
          const baseUrls = {
            amazon: marketplace === 'brazil' ? 'https://amazon.com.br/dp/' : 'https://amazon.com/dp/',
            mercadolivre: 'https://mercadolivre.com.br/p/',
            shopee: 'https://shopee.com.br/product/'
          };
          return baseUrls[marketplaceType as keyof typeof baseUrls] + asin;
        };
        
        return (
          <div className="flex items-start gap-2 w-[220px]">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              {settings.showProductImages && imageUrl ? (
                <img
                  src={imageUrl} 
                  alt={title || 'Product'}
                  className="h-20 w-20 rounded-lg object-cover shadow-sm border border-border"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    // Hide the broken image and show "No Image" div instead
                    img.style.display = 'none';
                    const noImageDiv = document.createElement('div');
                    noImageDiv.className = 'h-20 w-20 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground';
                    noImageDiv.textContent = 'No Image';
                    img.parentElement?.appendChild(noImageDiv);
                  }}
                />
              ) : settings.showProductImages ? (
                <div className="h-20 w-20 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                  No Image
                </div>
              ) : null}
              {/* Manual costs badge */}
              {(row.original as any).costs?.custos_manuais ? (
                <Badge variant="secondary" className="h-5 px-2 text-[10px]">Manual</Badge>
              ) : null}
              {/* ASIN below the image */}
              <a 
                href={getProductUrl(row.original.asin, marketplace, marketplaceType)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground font-mono hover:text-foreground transition-colors text-center"
              >
                {row.original.asin}
              </a>
            </div>
            
            <div className="min-w-0 flex-1">
              {/* Marketplace info */}
              <div className="flex items-center gap-2 mb-1">
                <MarketplaceFlag marketplace={marketplace} />
                <MarketplaceLogo marketplace={marketplaceType} />
              </div>
              
              {/* Product details: inline metrics beside image (as requested) */}
              <div className="space-y-0.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="font-medium">Stock:</span>
                  <span className="text-foreground font-mono text-xs">
                    {stock}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">Buy Box:</span>
                  <span className="text-foreground text-xs">
                    {buyBox || 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">Sellers:</span>
                  <span className="text-foreground font-mono text-xs">
                    {sellers ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      },
      enableSorting: false,
      size: 220,
    },
    {
      id: 'cogs',
      header: () => <div className="text-center font-semibold">COGS</div>,
      cell: ({ row }) => (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openCOGSModal(
              row.original.asin,
              row.original.sku,
              row.original.title
            )}
            className="h-8 w-8 p-0 hover:bg-primary/10"
          >
            <Calculator className="h-4 w-4 text-primary" />
          </Button>
        </div>
      ),
      enableSorting: false,
      size: 60,
    },
    {
      id: 'trending',
      header: () => <div className="text-center font-semibold">TRENDS</div>,
      cell: ({ row }) => (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openTrendingModal(
              row.original.asin,
              row.original.sku,
              row.original.title
            )}
            className="h-8 w-8 p-0 hover:bg-blue-50 dark:hover:bg-blue-950"
          >
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </Button>
        </div>
      ),
      enableSorting: false,
      size: 60,
    },
    {
      id: 'sku',
      accessorKey: 'sku',
      header: ({ column }) => {
        return (
          <div className="text-center">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="h-auto p-0 font-semibold"
            >
              SKU
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-1 h-3 w-3" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-1 h-3 w-3" />
              ) : (
                <ArrowUpDown className="ml-1 h-3 w-3" />
              )}
            </Button>
          </div>
        )
      },
      cell: ({ row }) => {
        const sku = row.getValue('sku') as string;
        return (
          <div className="text-center">
            <div className="inline-block font-mono text-sm text-foreground bg-muted/20 px-2 py-1 rounded-md border">
              {sku}
            </div>
          </div>
        );
      },
      size: 130,
    },
    // New independent columns: Stock, Buy Box, Sellers
    {
      id: 'stock',
      accessorKey: 'stock',
      header: ({ column }) => (
        <div className="text-center">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-auto p-0 font-semibold"
          >
            STOCK
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-3 w-3" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-3 w-3" />
            ) : (
              <ArrowUpDown className="ml-1 h-3 w-3" />
            )}
          </Button>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-center font-mono">{Number(row.getValue('stock') ?? 0)}</div>
      ),
      size: 90,
    },
    {
      id: 'buy_box_winner',
      accessorKey: 'buy_box_winner',
      header: ({ column }) => (
        <div className="text-center">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-auto p-0 font-semibold"
          >
            BUY BOX
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-3 w-3" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-3 w-3" />
            ) : (
              <ArrowUpDown className="ml-1 h-3 w-3" />
            )}
          </Button>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-center truncate max-w-[140px]" title={String(row.getValue('buy_box_winner') ?? '')}>
          {row.getValue('buy_box_winner') ?? 'Unknown'}
        </div>
      ),
      size: 160,
    },
    {
      id: 'sellers',
      accessorKey: 'sellers',
      header: ({ column }) => (
        <div className="text-center">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-auto p-0 font-semibold"
          >
            SELLERS
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="ml-1 h-3 w-3" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="ml-1 h-3 w-3" />
            ) : (
              <ArrowUpDown className="ml-1 h-3 w-3" />
            )}
          </Button>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-center font-mono">{row.getValue('sellers') ?? 0}</div>
      ),
      size: 110,
    },
    {
      id: 'health',
      accessorKey: 'health',
      header: () => <div className="text-center font-semibold">HEALTH</div>,
      cell: ({ row }) => (
        <div className="flex justify-center">
          <HealthBadge health={row.getValue('health')} />
        </div>
      ),
      enableSorting: false,
      size: 80,
    },
    {
      id: 'units',
      accessorKey: 'units',
      header: ({ column }) => {
        return (
          <div className="text-right">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="h-auto p-0 font-semibold"
            >
              Units
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-1 h-3 w-3" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-1 h-3 w-3" />
              ) : (
                <ArrowUpDown className="ml-1 h-3 w-3" />
              )}
            </Button>
          </div>
        )
      },
      cell: ({ row }) => (
        <div className="text-right">
          <div className="inline-flex items-center justify-center bg-primary/10 text-primary font-bold px-2 py-1 rounded-md text-sm border border-primary/20">
            {formatNumber(row.getValue('units'))}
          </div>
        </div>
      ),
      size: 80,
    },
    {
      id: 'revenue',
      accessorKey: 'revenue',
      header: ({ column }) => {
        return (
          <div className="text-right">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="h-auto p-0 font-semibold"
            >
              Revenue
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-1 h-3 w-3" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-1 h-3 w-3" />
              ) : (
                <ArrowUpDown className="ml-1 h-3 w-3" />
              )}
            </Button>
          </div>
        )
      },
      cell: ({ row }) => {
        const value = row.getValue('revenue') as number;
        const isHighPerformer = settings.highlightBestPerformers && value > 1000;
        
        return (
          <div className="text-right">
            <div className={cn(
              "inline-flex items-center justify-center font-bold px-2 py-1 rounded-md text-sm border",
              isHighPerformer 
                ? "bg-success/20 text-success border-success/30" 
                : "bg-muted/30 text-foreground border-border"
            )}>
              {formatCurrency(value)}
            </div>
          </div>
        );
      },
      size: 120,
    },
    {
      id: 'profit',
      accessorKey: 'profit',
      header: ({ column }) => {
        return (
          <div className="text-right">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="h-auto p-0 font-semibold"
            >
              Profit
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-1 h-3 w-3" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-1 h-3 w-3" />
              ) : (
                <ArrowUpDown className="ml-1 h-3 w-3" />
              )}
            </Button>
          </div>
        )
      },
      cell: ({ row }) => {
        const value = row.getValue('profit') as number;
        const revenue = row.getValue('revenue') as number;
        const costs = (row.original as any).costs as {
          compra?: number | null;
          armazenagem?: number | null;
          frete_amazon?: number | null;
          custos_percentuais?: number | null;
          imposto_percent?: number | null;
          custo_variavel_percent?: number | null;
          margem_contribuicao_percent?: number | null;
          custos_manuais?: boolean | null;
        } | undefined;

        // Show "Add costs" link when profit is NULL (no real cost data)
        if (value === null || value === undefined) {
          return (
            <div className="text-right">
              <Button
                variant="link"
                size="sm"
                onClick={() => openAddCostsModal(
                  row.original.asin,
                  row.original.sku,
                  row.original.title
                )}
                className="text-xs px-2 py-1 h-auto text-primary hover:text-primary/80"
              >
                + Add costs
              </Button>
            </div>
          );
        }
        
        const isNegative = value < 0;

        // Compute breakdown for tooltip if costs available
        const compra = costs?.compra ?? null;
        const armazenagem = costs?.armazenagem ?? null;
        const frete = costs?.frete_amazon ?? null;
        const pctCustos = costs?.custos_percentuais ?? null;
        const pctImposto = costs?.imposto_percent ?? null;
        const pctVariavel = costs?.custo_variavel_percent ?? null;
        const perUnitSum = (compra || 0) + (armazenagem || 0) + (frete || 0);
        const pctSum = (pctCustos || 0) + (pctImposto || 0) + (pctVariavel || 0);
        const variableCosts = revenue * (pctSum / 100);
        const hasAnyCost = (compra ?? armazenagem ?? frete ?? pctCustos ?? pctImposto ?? pctVariavel) !== null;

        return (
          <div className="text-right">
            <div className="inline-flex items-center justify-end gap-2">
              <div className={cn(
                "inline-flex items-center justify-center font-bold px-2 py-1 rounded-md text-sm border",
                isNegative 
                  ? "bg-destructive/20 text-destructive border-destructive/30" 
                  : "bg-success/20 text-success border-success/30"
              )}>
                {formatCurrency(value)}
              </div>

              {costs?.custos_manuais ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Wrench className="h-4 w-4 text-primary" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">Custos manuais ativos</div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}

              {hasAnyCost ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[10px] px-1 py-0.5">COGS</Badge>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      <div className="space-y-1">
                        <div className="font-semibold">Breakdown COGS</div>
                        <div>
                          <span className="text-muted-foreground">Por unidade:</span>
                          <div>Compra: {compra !== null ? formatCurrency(compra) : '—'}</div>
                          <div>Armazenagem: {armazenagem !== null ? formatCurrency(armazenagem) : '—'}</div>
                          <div>Frete Amazon: {frete !== null ? formatCurrency(frete) : '—'}</div>
                          <div>Total unitário: {formatCurrency((compra || 0) + (armazenagem || 0) + (frete || 0))}</div>
                        </div>
                        <div className="pt-1">
                          <span className="text-muted-foreground">Percentuais sobre receita:</span>
                          <div>Custos: {pctCustos !== null ? `${pctCustos}%` : '—'}</div>
                          <div>Imposto: {pctImposto !== null ? `${pctImposto}%` : '—'}</div>
                          <div>Variável: {pctVariavel !== null ? `${pctVariavel}%` : '—'}</div>
                          <div>Componentes variáveis: {formatCurrency(variableCosts)}</div>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>
          </div>
        );
      },
      size: 120,
    },
    {
      id: 'roi',
      accessorKey: 'roi',
      header: ({ column }) => {
        return (
          <div className="text-right">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="h-auto p-0 font-semibold"
            >
              ROI
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-1 h-3 w-3" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-1 h-3 w-3" />
              ) : (
                <ArrowUpDown className="ml-1 h-3 w-3" />
              )}
            </Button>
          </div>
        )
      },
      cell: ({ row }) => {
        const value = row.getValue('roi') as number;
        
        // Show "Add costs" link when ROI is NULL (no real cost data)
        if (value === null || value === undefined) {
          return (
            <div className="text-right">
              <Button
                variant="link"
                size="sm"
                onClick={() => openAddCostsModal(
                  row.original.asin,
                  row.original.sku,
                  row.original.title
                )}
                className="text-xs px-2 py-1 h-auto text-primary hover:text-primary/80"
              >
                + Add costs
              </Button>
            </div>
          );
        }
        
        const isGoodROI = value > 50; // ROI > 50% is good
        
        return (
          <div className="text-right">
            <div className={cn(
              "inline-flex items-center justify-center font-bold px-2 py-1 rounded-md text-sm border",
              isGoodROI 
                ? "bg-primary/20 text-primary border-primary/30" 
                : "bg-muted/30 text-muted-foreground border-border"
            )}>
              {`${value.toFixed(1)}%`}
            </div>
          </div>
        );
      },
      size: 90,
    },
    {
      id: 'acos',
      accessorKey: 'acos',
      header: ({ column }) => {
        return (
          <div className="text-right">
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="h-auto p-0 font-semibold"
            >
              ACOS
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-1 h-3 w-3" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-1 h-3 w-3" />
              ) : (
                <ArrowUpDown className="ml-1 h-3 w-3" />
              )}
            </Button>
          </div>
        )
      },
      cell: ({ row }) => {
        const value = row.getValue('acos') as number;
        const isLowACOS = typeof value === 'number' ? value < 30 : false;
        
        return (
          <div className="text-right">
            <div className={cn(
              "inline-flex items-center justify-center font-bold px-2 py-1 rounded-md text-sm border",
              typeof value === 'number'
                ? (isLowACOS ? "bg-success/20 text-success border-success/30" : "bg-warning/20 text-warning border-warning/30")
                : "bg-muted/30 text-foreground border-border"
            )}>
              {typeof value === 'number' ? formatPercentage(value) : '—'}
            </div>
          </div>
        );
      },
      size: 90,
    },
  ].filter(column => {
    // Always show the image column
    if (column.id === 'image') return true;
    // Filter other columns based on visibility settings
    const columnKey = (column.id || column.accessorKey) as keyof ColumnVisibility;
    return columnVisibility[columnKey] === true;
  }), [columnVisibility, settings]);

  const table = useReactTable({
    data: groupedRows, // Use aggregated data instead of raw rows
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true,
    state: {
      sorting: [{ id: filters.sortBy || 'revenue', desc: filters.sortDir === 'desc' }],
    },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' 
        ? updater([{ id: filters.sortBy || 'revenue', desc: filters.sortDir === 'desc' }])
        : updater;
      
      if (newSorting.length > 0) {
        onFiltersChange({
          sortBy: newSorting[0].id,
          sortDir: newSorting[0].desc ? 'desc' : 'asc',
        });
      }
    },
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!data || groupedRows.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="text-muted-foreground">
          <div className="text-lg font-medium mb-2">No sales data found</div>
          <div>Try adjusting your filters or date range</div>
        </div>
      </Card>
    );
  }

  const TotalRow = ({ position }: { position: 'top' | 'bottom' }) => (
    <tr className={cn(
      "bg-gradient-to-r from-primary/10 to-accent/10 backdrop-blur-sm sticky border border-primary/20",
      position === 'top' ? "top-0 z-10" : "bottom-0"
    )}>
      <td className="p-2 text-left" colSpan={columns.length}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-primary/20 text-primary font-semibold px-2 py-1 text-xs">
              Total ({groupedRows.length})
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1">
                  <Layers className="h-3 w-3" />
                  {groupByMode === 'asin' ? 'ASIN' : 
                   groupByMode === 'asin_marketplace' ? 'ASIN + Market' : 'SKU'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem 
                  onClick={() => setSettings({ groupByMode: 'asin' })}
                  className={cn("text-xs", groupByMode === 'asin' && "bg-primary/10")}
                >
                  Group by ASIN
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setSettings({ groupByMode: 'asin_marketplace' })}
                  className={cn("text-xs", groupByMode === 'asin_marketplace' && "bg-primary/10")}
                >
                  Group by ASIN + Marketplace
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setSettings({ groupByMode: 'sku' })}
                  className={cn("text-xs", groupByMode === 'sku' && "bg-primary/10")}
                >
                  Group by SKU
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="text-muted-foreground">Units:</div>
            <div className="font-bold text-primary">{formatNumber(computedTotalRow.units)}</div>
            <div className="text-muted-foreground">Revenue:</div>
            <div className="font-bold text-success">{formatCurrency(computedTotalRow.revenue)}</div>
            <div className="text-muted-foreground">Profit:</div>
            <div className={cn("font-bold", 
              computedTotalRow.profit === null ? "text-muted-foreground" :
              computedTotalRow.profit >= 0 ? "text-success" : "text-destructive"
            )}>
              {computedTotalRow.profit !== null && computedTotalRow.profit !== undefined ? formatCurrency(computedTotalRow.profit) : '—'}
            </div>
            <div className="text-muted-foreground">ROI:</div>
            <div className="font-bold text-accent">
              {computedTotalRow.roi !== null && computedTotalRow.roi !== undefined ? `${computedTotalRow.roi.toFixed(1)}%` : '—'}
            </div>
            <div className="text-muted-foreground">ACOS:</div>
            <div className="font-bold text-accent">{computedTotalRow.acos ? formatPercentage(computedTotalRow.acos) : '—'}</div>
          </div>
        </div>
      </td>
    </tr>
  );

  return (
    <>
      {/* Debug Panel - Only in development */}
      {import.meta.env.DEV && (
        <div className="mb-4">
          <Collapsible open={showDebug} onOpenChange={setShowDebug}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Bug className="h-4 w-4" />
                Debug Panel
                {showDebug ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mt-2 p-4 bg-muted/50">
                <div className="space-y-2 text-xs font-mono">
                  <div>
                    <strong>Raw data rows:</strong> {data?.rows?.length || 0}
                  </div>
                  <div>
                    <strong>Grouped rows:</strong> {groupedRows.length}
                  </div>
                  <div>
                    <strong>Group by mode:</strong> {groupByMode}
                  </div>
                  <div>
                    <strong>Total row from backend:</strong> {data?.totalRow ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <strong>Computed totals:</strong>
                    <pre className="mt-1 p-2 bg-background rounded">
                      {JSON.stringify(computedTotalRow, null, 2)}
                    </pre>
                  </div>
                  {data?.rows?.[0] && (
                    <div>
                      <strong>First raw row fields:</strong>
                      <pre className="mt-1 p-2 bg-background rounded max-h-40 overflow-auto">
                        {JSON.stringify(Object.keys(data.rows[0]), null, 2)}
                      </pre>
                    </div>
                  )}
                  {groupedRows[0] && (
                    <div>
                      <strong>First grouped row:</strong>
                      <pre className="mt-1 p-2 bg-background rounded max-h-40 overflow-auto">
                        {JSON.stringify(groupedRows[0], null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
      
      <Card className="h-full overflow-hidden shadow-lg border-0 bg-background m-0">
        <div className="h-full overflow-auto custom-scrollbar">
          <table className="w-full border-collapse table-fixed">
            <thead className="bg-muted/50 sticky top-0 z-20">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th 
                      key={header.id} 
                      className="text-left px-1 py-2 border-b border-border/50 font-semibold text-foreground/80 text-xs uppercase tracking-wide"
                      style={{ width: header.column.columnDef.size ? `${header.column.columnDef.size}px` : 'auto' }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {settings.showTotalRowTop && <TotalRow position="top" />}
              {table.getRowModel().rows.map((row, index) => (
                 <tr 
                  key={row.id} 
                  className={cn(
                    "hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5 border-b border-border/30 transition-all duration-200 hover:shadow-sm",
                    index % 2 === 0 ? "bg-background" : "bg-muted/20",
                    settings.tableHeight === 'compact' ? 'h-10' : 
                    settings.tableHeight === 'comfortable' ? 'h-12' : 'h-16'
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn(
                      "align-middle", 
                      settings.tableHeight === 'compact' ? 'px-1 py-1' : 
                      settings.tableHeight === 'comfortable' ? 'px-1 py-2' : 'px-2 py-3'
                    )} style={{ width: cell.column.columnDef.size ? `${cell.column.columnDef.size}px` : 'auto' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {settings.showTotalRowBottom && <TotalRow position="bottom" />}
            </tbody>
          </table>
        </div>
      </Card>

      <COGSModal
        isOpen={cogsModal.isOpen}
        onClose={closeCOGSModal}
        asin={cogsModal.asin}
        sku={cogsModal.sku}
        productTitle={cogsModal.title}
        revenue={0}
      />

      <TrendingModal
        isOpen={trendingModal.isOpen}
        onClose={closeTrendingModal}
        asin={trendingModal.asin}
        sku={trendingModal.sku}
        productTitle={trendingModal.title}
      />

      <AddCostsModal
        isOpen={addCostsModal.isOpen}
        onClose={closeAddCostsModal}
        asin={addCostsModal.asin}
        sku={addCostsModal.sku}
        productTitle={addCostsModal.title}
        initialCosts={(data?.rows?.find(r => r.asin === addCostsModal.asin) as any)?.costs}
        onSave={() => {
          // Refresh the data after saving costs
          window.location.reload();
        }}
      />
    </>
  );
}
