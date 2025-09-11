import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Settings, Eye, EyeOff } from 'lucide-react';
import { useSalesStore } from '@/stores/salesStore';

export function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { columnVisibility, settings, setColumnVisibility, setSettings, resetToDefaults } = useSalesStore();

  const columnOptions = [
    { key: 'cogs' as const, label: 'COGS' },
    { key: 'trending' as const, label: 'Trends' },
    { key: 'sku' as const, label: 'SKU' },
    { key: 'health' as const, label: 'Health' },
    { key: 'units' as const, label: 'Units' },
    { key: 'revenue' as const, label: 'Revenue' },
    { key: 'profit' as const, label: 'Profit' },
    { key: 'roi' as const, label: 'ROI' },
    { key: 'acos' as const, label: 'ACOS' },
  ];

  const tableHeightOptions = [
    { value: 'compact', label: 'Compact' },
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'spacious', label: 'Spacious' },
  ];

  const refreshIntervalOptions = [
    { value: 15000, label: '15 seconds' },
    { value: 30000, label: '30 seconds' },
    { value: 60000, label: '1 minute' },
    { value: 300000, label: '5 minutes' },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-white hover:bg-white/20 hover:text-white">
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dashboard Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Column Visibility */}
          <div>
            <h4 className="text-sm font-medium mb-3">Column Visibility</h4>
            <div className="space-y-2">
              {columnOptions.map((option) => (
                <div key={option.key} className="flex items-center justify-between">
                  <Label htmlFor={`column-${option.key}`} className="flex items-center gap-2">
                    {columnVisibility[option.key] ? (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    {option.label}
                  </Label>
                  <Switch
                    id={`column-${option.key}`}
                    checked={columnVisibility[option.key]}
                    onCheckedChange={(checked) => {
                      console.log(`Setting column ${option.key} to ${checked}`);
                      setColumnVisibility({ [option.key]: checked });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Display Settings */}
          <div>
            <h4 className="text-sm font-medium mb-3">Display Settings</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="total-row-top">Show total row at top</Label>
                <Switch
                  id="total-row-top"
                  checked={settings.showTotalRowTop}
                  onCheckedChange={(checked) => {
                    console.log(`Setting showTotalRowTop to ${checked}`);
                    setSettings({ showTotalRowTop: checked });
                  }}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="total-row-bottom">Show total row at bottom</Label>
                <Switch
                  id="total-row-bottom"
                  checked={settings.showTotalRowBottom}
                  onCheckedChange={(checked) => {
                    console.log(`Setting showTotalRowBottom to ${checked}`);
                    setSettings({ showTotalRowBottom: checked });
                  }}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="product-images">Show product images</Label>
                <Switch
                  id="product-images"
                  checked={settings.showProductImages}
                  onCheckedChange={(checked) => {
                    console.log(`Setting showProductImages to ${checked}`);
                    setSettings({ showProductImages: checked });
                  }}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="highlight-performers">Highlight best performers</Label>
                <Switch
                  id="highlight-performers"
                  checked={settings.highlightBestPerformers}
                  onCheckedChange={(checked) => 
                    setSettings({ highlightBestPerformers: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="table-height">Table row height</Label>
                <Select
                  value={settings.tableHeight}
                  onValueChange={(value) => 
                    setSettings({ tableHeight: value as any })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tableHeightOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Real-time Updates */}
          <div>
            <h4 className="text-sm font-medium mb-3">Real-time Updates</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="real-time">Enable real-time updates</Label>
                <Switch
                  id="real-time"
                  checked={settings.enableRealTimeUpdates}
                  onCheckedChange={(checked) => 
                    setSettings({ enableRealTimeUpdates: checked })
                  }
                />
              </div>
              
              {settings.enableRealTimeUpdates && (
                <div className="space-y-2">
                  <Label htmlFor="refresh-interval">Refresh interval</Label>
                  <Select
                    value={String(settings.autoRefreshInterval)}
                    onValueChange={(value) => 
                      setSettings({ autoRefreshInterval: Number(value) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {refreshIntervalOptions.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Reset */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Reset preferences and filters</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                try {
                  localStorage.removeItem('sales-dashboard-preferences');
                  localStorage.removeItem('sales_last_filters');
                } catch {}
                resetToDefaults();
                setIsOpen(false);
                setTimeout(() => window.location.reload(), 100);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}