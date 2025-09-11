import { Card } from '@/components/ui/card';
import { AnalyticsTables } from '@/components/sales/AnalyticsTables';

const Analytics = () => {
  return (
    <div className="min-h-screen bg-background p-3">
      <div className="max-w-7xl mx-auto space-y-3">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold">Analytics</h1>
        </header>

        <Card className="p-0 border-none shadow-none">
          <AnalyticsTables />
        </Card>
      </div>
    </div>
  );
};

export default Analytics;

