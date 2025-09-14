import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { 
  ShoppingCart, 
  Calendar, 
  User, 
  MapPin, 
  Mail, 
  Phone, 
  Package, 
  DollarSign,
  Truck,
  Filter,
  X,
  ExternalLink
} from 'lucide-react';
import { formatCurrency } from '@/lib/filters';
import { MarketplaceFlag } from './MarketplaceFlag';
import { MarketplaceLogo } from './MarketplaceLogo';
import { api } from '@/services/api';

type OrdersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  asin: string;
  sku?: string;
  productTitle: string;
  marketplace?: 'brazil' | 'usa';
  marketplaceId?: string;
};

type OrderItem = {
  sku: string;
  asin: string;
  title: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  itemTax?: number;
  promotionDiscount?: number;
  conditionId?: string;
  isGift?: boolean;
  // MercadoLibre specific
  fullUnitPrice?: number;
  saleFee?: number;
  categoryId?: string;
  variationId?: number;
  listingTypeId?: string;
};

type DetailedOrder = {
  marketplace: 'amazon' | 'mercadolivre';
  marketplace_code: string;
  order_id: string;
  purchase_date: string;
  order_status: string;
  order_total: number;
  currency: string;
  customer_name: string;
  customer_email: string;
  customer_id?: string;
  customer_phone?: string;
  shipping_city: string;
  shipping_state: string;
  shipping_postal: string;
  shipping_country: string;
  is_prime?: boolean;
  fulfillment_channel: string;
  sales_channel: string;
  updated_at: string;
  items: OrderItem[];
};

type OrdersResponse = {
  orders: DetailedOrder[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  summary: {
    total_orders: number;
    total_revenue: number;
    amazon_orders: number;
    ml_orders: number;
  };
};

export function OrdersModal({ 
  isOpen, 
  onClose, 
  asin, 
  sku, 
  productTitle, 
  marketplace = 'usa',
  marketplaceId 
}: OrdersModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [orders, setOrders] = useState<DetailedOrder[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });
  const [summary, setSummary] = useState({
    total_orders: 0,
    total_revenue: 0,
    amazon_orders: 0,
    ml_orders: 0,
  });

  // Filters
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    status: 'all',
    channel: 'all', // all, amazon, mercadolivre
    search: '',
  });

  useEffect(() => {
    if (isOpen) {
      loadOrders(1);
    }
  }, [isOpen, asin, sku]);

  const loadOrders = async (page: number = 1) => {
    setIsLoading(true);
    try {
      // Build search parameter - prioritize user search, fallback to ASIN/SKU
      let searchParam = filters.search;
      if (!searchParam) {
        if (asin && asin !== 'N/A') {
          searchParam = asin;
        } else if (sku) {
          searchParam = sku;
        }
      }

      const params: {
        page: number;
        limit: number;
        channel: 'all' | 'amazon' | 'mercadolivre';
        startDate?: string;
        endDate?: string;
        status?: string;
        search?: string;
      } = {
        page,
        limit: pagination.limit,
        channel: filters.channel as 'all' | 'amazon' | 'mercadolivre',
      };

      // Add optional parameters only if they have values
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.status !== 'all') params.status = filters.status;
      if (searchParam) params.search = searchParam;

      const response = await api.getDetailedOrders(params);
      
      if (response.error) {
        throw new Error(response.error);
      }

      const data: OrdersResponse = response.data;
      
      setOrders(data.orders || []);
      setPagination(data.pagination || pagination);
      setSummary(data.summary || summary);

    } catch (error) {
      console.error('Error loading orders:', error);
      toast({
        title: "Error loading orders",
        description: "Failed to load detailed orders data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    loadOrders(1);
  };

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      status: 'all',
      channel: 'all',
      search: '',
    });
    // Reload with cleared filters
    setTimeout(() => loadOrders(1), 100);
  };

  const getStatusColor = (status: string) => {
    if (!status) return 'bg-gray-100 text-gray-800';
    
    switch (status.toLowerCase()) {
      case 'shipped':
      case 'delivered':
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'pending':
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
      case 'canceled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getMarketplaceFromOrder = (order: DetailedOrder): 'brazil' | 'usa' => {
    if (order.marketplace === 'mercadolivre') return 'brazil';
    if (order.marketplace_code === 'A2Q3Y263D00KWC') return 'brazil'; // Amazon BR
    return 'usa'; // Default to USA for Amazon US
  };

  const getMarketplaceTypeFromOrder = (order: DetailedOrder): 'amazon' | 'mercadolivre' => {
    return order.marketplace === 'mercadolivre' ? 'mercadolivre' : 'amazon';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Detailed Orders
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>ASIN: {asin}</span>
            {sku && <span>• SKU: {sku}</span>}
            <span>• {productTitle}</span>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.total_orders}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(summary.total_revenue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Amazon</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{summary.amazon_orders}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Mercado Livre</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{summary.ml_orders}</div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Filter className="h-4 w-4" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="shipped">Shipped</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel">Channel</Label>
                  <Select value={filters.channel} onValueChange={(value) => handleFilterChange('channel', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Channels</SelectItem>
                      <SelectItem value="amazon">Amazon</SelectItem>
                      <SelectItem value="mercadolivre">Mercado Livre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="search">Search</Label>
                  <Input
                    id="search"
                    placeholder="Order ID, Customer..."
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={applyFilters} className="flex-1">
                    Apply
                  </Button>
                  <Button variant="outline" onClick={clearFilters}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Orders List */}
          <div className="flex-1">
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          <Skeleton className="h-4 w-[200px]" />
                          <Skeleton className="h-4 w-[300px]" />
                          <Skeleton className="h-4 w-[250px]" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center text-muted-foreground">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No orders found for this product</p>
                      <p className="text-sm">Try adjusting your filters or check if the ASIN/SKU is correct</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <Card key={order.order_id} className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Order Info */}
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <MarketplaceLogo 
                                marketplace={getMarketplaceTypeFromOrder(order)} 
                                className="h-6 w-6" 
                              />
                              <MarketplaceFlag 
                                marketplace={getMarketplaceFromOrder(order)} 
                                className="h-4 w-4" 
                              />
                              <span className="font-semibold">#{order.order_id}</span>
                              <Badge className={getStatusColor(order.order_status)}>
                                {order.order_status}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              {new Date(order.purchase_date).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>

                            <div className="flex items-center gap-2 text-sm">
                              <DollarSign className="h-4 w-4 text-green-600" />
                              <span className="font-semibold text-green-600">
                                {formatCurrency(order.order_total)}
                              </span>
                            </div>

                            {order.fulfillment_channel && (
                              <div className="flex items-center gap-2 text-sm">
                                <Truck className="h-4 w-4" />
                                <span className="capitalize">{order.fulfillment_channel}</span>
                                {order.is_prime && (
                                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                    Prime
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Customer Info */}
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span className="font-medium">{order.customer_name || 'N/A'}</span>
                            </div>

                            {order.customer_email && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Mail className="h-4 w-4" />
                                <span>{order.customer_email}</span>
                              </div>
                            )}

                            {order.customer_phone && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="h-4 w-4" />
                                <span>{order.customer_phone}</span>
                              </div>
                            )}

                            <div className="flex items-start gap-2 text-sm text-muted-foreground">
                              <MapPin className="h-4 w-4 mt-0.5" />
                              <div>
                                {order.shipping_city && order.shipping_state ? (
                                  <div>
                                    <div>{order.shipping_city}, {order.shipping_state}</div>
                                    {order.shipping_postal && <div>{order.shipping_postal}</div>}
                                    {order.shipping_country && <div>{order.shipping_country}</div>}
                                  </div>
                                ) : (
                                  <span>Address not available</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Order Items */}
                        {order.items && order.items.length > 0 && (
                          <div className="mt-4 pt-4 border-t">
                            <div className="flex items-center gap-2 mb-3">
                              <Package className="h-4 w-4" />
                              <span className="font-medium">Items ({order.items.length})</span>
                            </div>
                            <div className="space-y-2">
                              {order.items.map((item, index) => (
                                <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                                  <div className="flex-1">
                                    <div className="font-medium text-sm">{item.title || item.sku}</div>
                                    <div className="text-xs text-muted-foreground">
                                      SKU: {item.sku} • ASIN: {item.asin}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-medium">
                                      {item.quantity}x {formatCurrency(item.unitPrice)}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      Total: {formatCurrency(item.totalPrice)}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} orders
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadOrders(pagination.page - 1)}
                  disabled={pagination.page <= 1 || isLoading}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadOrders(pagination.page + 1)}
                  disabled={pagination.page >= pagination.pages || isLoading}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}