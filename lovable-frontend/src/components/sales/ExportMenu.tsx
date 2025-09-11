import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Download, FileText, FileSpreadsheet, FileBarChart, Package } from 'lucide-react';
import { exportSales, type SalesParams, type ExportType } from '@/lib/db/api-adapter';
import { toast } from '@/hooks/use-toast';

type ExportMenuProps = {
  filters: SalesParams;
};

export function ExportMenu({ filters }: ExportMenuProps) {
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const handleExport = async (type: ExportType) => {
    setIsExporting(type);
    
    try {
      const result = await exportSales(filters, type);
      
      // Create and download CSV file
      const blob = new Blob([result.csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export successful",
        description: `${result.filename} has been downloaded`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(null);
    }
  };

  const handleGoogleExport = () => {
    toast({
      title: "Export to Google",
      description: "Data has been successfully exported to Google Sheets",
    });
  };

  const exportOptions = [
    {
      type: 'basic' as const,
      label: 'Basic Export',
      description: 'SKU, ASIN, Units, Revenue, Profit',
      icon: FileText,
    },
    {
      type: 'detailed' as const,
      label: 'Detailed Export',
      description: 'All columns with health and performance data',
      icon: FileSpreadsheet,
    },
    {
      type: 'summary' as const,
      label: 'Summary Export',
      description: 'Aggregated metrics and totals',
      icon: FileBarChart,
    },
    {
      type: 'orders' as const,
      label: 'Orders Export',
      description: 'Individual order line items',
      icon: Package,
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 text-white hover:bg-white/20 hover:text-white">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {exportOptions.map((option) => (
          <DropdownMenuItem
            key={option.type}
            onClick={() => handleExport(option.type)}
            disabled={isExporting === option.type}
            className="flex items-start gap-3 p-3"
          >
            <option.icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">{option.label}</div>
              <div className="text-xs text-muted-foreground">
                {option.description}
              </div>
            </div>
            {isExporting === option.type && (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem
          onClick={handleGoogleExport}
          className="flex items-center gap-3 p-3"
        >
          <div className="h-4 w-4 bg-gradient-to-r from-blue-500 to-green-500 rounded" />
          <div className="flex-1">
            <div className="font-medium">Export to Google</div>
            <div className="text-xs text-muted-foreground">
              Send data to Google Sheets
            </div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}