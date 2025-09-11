import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { HelpCircle, Play, BookOpen, Filter, Download, Settings } from 'lucide-react';

export function TutorialsMenu() {
  const [isOpen, setIsOpen] = useState(false);

  const tutorials = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      icon: Play,
      content: [
        {
          title: 'Dashboard Overview',
          description: 'Learn the basics of navigating the sales dashboard and understanding key metrics.',
          steps: [
            'The dashboard shows your sales performance across all products',
            'Use the date range picker to select different time periods',
            'Key metrics include Units, Revenue, Profit, ROI, and ACOS',
            'Health indicators help you quickly identify performance issues',
          ],
        },
        {
          title: 'Reading the Data',
          description: 'Understand what each column means and how to interpret the data.',
          steps: [
            'SKU: Your product identifier',
            'ASIN: Amazon\'s unique product identifier',
            'Health: Performance indicator (Good/Warning/Poor)',
            'Units: Number of items sold',
            'Revenue: Total sales amount',
            'Profit: Revenue minus advertising costs',
            'ROI: Return on investment percentage',
            'ACOS: Advertising Cost of Sales percentage',
          ],
        },
      ],
    },
    {
      id: 'filtering',
      title: 'Filtering & Searching',
      icon: Filter,
      content: [
        {
          title: 'Date Range Selection',
          description: 'Choose the perfect time period for your analysis.',
          steps: [
            'Use preset ranges like "Last 30 days" or "Last 12 months"',
            'Select custom date ranges for specific periods',
            'Default view shows the last 12 months of data',
          ],
        },
        {
          title: 'Advanced Filters',
          description: 'Narrow down your data with powerful filtering options.',
          steps: [
            'Filter by marketplaces (US, UK, DE, etc.)',
            'Filter by order types (FBA, FBM, Business)',
            'Search by SKU, ASIN, or product title',
            'Use metric filters to find products above/below thresholds',
            'Combine multiple filters for precise data analysis',
          ],
        },
      ],
    },
    {
      id: 'exporting',
      title: 'Exporting Data',
      icon: Download,
      content: [
        {
          title: 'Export Options',
          description: 'Get your data in the format you need.',
          steps: [
            'Basic Export: Essential columns (SKU, ASIN, Units, Revenue, Profit)',
            'Detailed Export: All columns with complete performance data',
            'Summary Export: Aggregated metrics and totals',
            'Orders Export: Individual order line items',
          ],
        },
        {
          title: 'Google Integration',
          description: 'Send data directly to Google Sheets.',
          steps: [
            'Click "Export to Google" for instant Google Sheets integration',
            'Data is automatically formatted and ready for analysis',
            'Perfect for sharing with team members',
          ],
        },
      ],
    },
    {
      id: 'customization',
      title: 'Customization',
      icon: Settings,
      content: [
        {
          title: 'Column Visibility',
          description: 'Show only the data that matters to you.',
          steps: [
            'Hide or show any column using the settings menu',
            'Customize your view for different use cases',
            'Settings are automatically saved',
          ],
        },
        {
          title: 'Display Preferences',
          description: 'Personalize your dashboard experience.',
          steps: [
            'Toggle total rows at top or bottom of the table',
            'Enable/disable product images',
            'Highlight best performing products',
            'Adjust table row height for better readability',
            'Configure real-time update intervals',
          ],
        },
      ],
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-white hover:bg-white/20 hover:text-white">
          <HelpCircle className="h-4 w-4" />
          Help
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Sales Dashboard Tutorials
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="getting-started" className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            {tutorials.map((tutorial) => (
              <TabsTrigger 
                key={tutorial.id} 
                value={tutorial.id}
                className="flex items-center gap-2 text-xs"
              >
                <tutorial.icon className="h-3 w-3" />
                {tutorial.title}
              </TabsTrigger>
            ))}
          </TabsList>
          
          <div className="mt-4 overflow-auto max-h-[calc(80vh-12rem)]">
            {tutorials.map((tutorial) => (
              <TabsContent key={tutorial.id} value={tutorial.id} className="mt-0">
                <div className="space-y-4">
                  {tutorial.content.map((section, index) => (
                    <Card key={index} className="p-4">
                      <div className="flex items-start gap-3">
                        <Badge variant="outline" className="mt-1">
                          {index + 1}
                        </Badge>
                        <div className="flex-1">
                          <h4 className="font-medium mb-2">{section.title}</h4>
                          <p className="text-sm text-muted-foreground mb-3">
                            {section.description}
                          </p>
                          <ul className="space-y-1">
                            {section.steps.map((step, stepIndex) => (
                              <li key={stepIndex} className="flex items-start gap-2 text-sm">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                                {step}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}