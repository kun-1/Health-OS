"use client";

/**
 * Page-level "is any data source currently fetching?" signal.
 *
 * Each page (LifeHome, ExpensesModule, ReceiptsModule, NutritionModule)
 * bumps `setRefreshing(true)` while its data hooks are mid-fetch, and the
 * Topbar renders a "更新中…" pill driven by this. The context lives in
 * shared/ so all pages and the LifeShell-rendered Topbar can share it
 * without prop-drilling.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type RefreshingContextValue = {
  refreshing: boolean;
  setRefreshing: (next: boolean) => void;
};

const RefreshingContext = createContext<RefreshingContextValue>({
  refreshing: false,
  setRefreshing: () => undefined
});

export function RefreshingProvider({ children }: { children: ReactNode }) {
  const [refreshing, setRefreshing] = useState(false);
  const value = useMemo(() => ({ refreshing, setRefreshing }), [refreshing]);
  return <RefreshingContext.Provider value={value}>{children}</RefreshingContext.Provider>;
}

export function useRefreshing(): RefreshingContextValue {
  return useContext(RefreshingContext);
}