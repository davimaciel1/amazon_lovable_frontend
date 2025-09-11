import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ColumnVisibility = {
  cogs: boolean;
  trending: boolean;
  sku: boolean;
  health: boolean;
  units: boolean;
  revenue: boolean;
  profit: boolean;
  roi: boolean;
  acos: boolean;
};

export type GroupByMode = 'asin' | 'asin_marketplace' | 'sku';

export type Settings = {
  showTotalRowTop: boolean;
  showTotalRowBottom: boolean;
  enableRealTimeUpdates: boolean;
  autoRefreshInterval: number;
  tableHeight: 'compact' | 'comfortable' | 'spacious';
  showProductImages: boolean;
  highlightBestPerformers: boolean;
  groupByCategory: boolean;
  groupByMode: GroupByMode;
};

type SalesStore = {
  columnVisibility: ColumnVisibility;
  settings: Settings;
  setColumnVisibility: (visibility: Partial<ColumnVisibility>) => void;
  setSettings: (settings: Partial<Settings>) => void;
  resetToDefaults: () => void;
};

const defaultColumnVisibility: ColumnVisibility = {
  cogs: true,
  trending: true,
  sku: true,
  health: true,
  units: true,
  revenue: true,
  profit: true,
  roi: true,
  acos: true,
};

const defaultSettings: Settings = {
  showTotalRowTop: false,
  showTotalRowBottom: true,
  enableRealTimeUpdates: true,
  autoRefreshInterval: 30000, // 30 seconds
  tableHeight: 'comfortable',
  showProductImages: true,
  highlightBestPerformers: true,
  groupByCategory: false,
  groupByMode: 'asin', // Default to ASIN grouping
};

export const useSalesStore = create<SalesStore>()(
  persist(
    (set) => ({
      columnVisibility: defaultColumnVisibility,
      settings: defaultSettings,
      
      setColumnVisibility: (visibility) =>
        set((state) => ({
          columnVisibility: { ...state.columnVisibility, ...visibility },
        })),
      
      setSettings: (settings) =>
        set((state) => ({
          settings: { ...state.settings, ...settings },
        })),
      
      resetToDefaults: () =>
        set({
          columnVisibility: defaultColumnVisibility,
          settings: defaultSettings,
        }),
    }),
    {
      name: 'sales-dashboard-preferences',
      partialize: (state) => ({
        columnVisibility: state.columnVisibility,
        settings: state.settings,
      }),
    }
  )
);