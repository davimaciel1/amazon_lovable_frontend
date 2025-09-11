import React, { useEffect } from 'react';
import { useCopilotReadable, useCopilotAction } from '@copilotkit/react-core';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface SalesData {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  topProducts: string[];
}

export function CopilotDemo({ salesData }: { salesData?: SalesData }) {
  // Make sales data readable by CopilotKit
  useCopilotReadable({
    description: "Current sales data for the Amazon seller platform",
    value: salesData || {
      totalRevenue: 125000,
      totalOrders: 450,
      averageOrderValue: 278,
      topProducts: ["Product A", "Product B", "Product C"]
    },
  });

  // Define an action that CopilotKit can perform
  useCopilotAction({
    name: "analyzeMetrics",
    description: "Analyze sales metrics and provide insights",
    parameters: [
      {
        name: "metric",
        type: "string",
        description: "The metric to analyze (revenue, orders, products)",
        required: true,
      },
      {
        name: "period",
        type: "string",
        description: "Time period for analysis",
        required: false,
      }
    ],
    handler: async ({ metric, period }) => {
      // This is where you'd call your backend API to get real analysis
      const analysisResult = `Analyzing ${metric} for ${period || 'all time'}...`;
      
      toast({
        title: "Metric Analysis",
        description: analysisResult,
      });

      return analysisResult;
    },
  });

  // Define another action for exporting data
  useCopilotAction({
    name: "exportData",
    description: "Export sales data to various formats",
    parameters: [
      {
        name: "format",
        type: "string",
        description: "Export format (csv, excel, pdf)",
        required: true,
      },
      {
        name: "dateRange",
        type: "string",
        description: "Date range for the export",
        required: false,
      }
    ],
    handler: async ({ format, dateRange }) => {
      toast({
        title: "Export Started",
        description: `Exporting data as ${format} for ${dateRange || 'all time'}`,
      });

      // Here you would trigger the actual export
      return `Data exported successfully as ${format}`;
    },
  });

  return (
    <Card className="p-4 mb-4">
      <h3 className="text-lg font-semibold mb-2">CopilotKit Integration</h3>
      <p className="text-sm text-muted-foreground mb-4">
        The AI assistant can now help you with:
      </p>
      <ul className="text-sm space-y-1 ml-4">
        <li>• Analyzing your sales metrics</li>
        <li>• Providing insights about your Amazon business</li>
        <li>• Exporting data in various formats</li>
        <li>• Answering questions about your performance</li>
      </ul>
      <p className="text-sm text-muted-foreground mt-4">
        Try asking: "What are my top selling products?" or "Export last month's data as CSV"
      </p>
    </Card>
  );
}