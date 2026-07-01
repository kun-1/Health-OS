"use client";

/**
 * Shared data loader for the /expenses and /expenses/receipts modules.
 *
 * Both pages need the full ExpenseAnalytics payload plus two derived
 * pieces of client state (pendingDrafts, transactionDrafts). They used
 * to duplicate the fetcher and the state plumbing; this hook keeps a
 * single implementation that both pages call.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { getStoredBudgetCents, getStoredPrimaryCurrency } from "@/lib/expenses/settings";
import type {
  ExpenseAnalytics,
  ExtractedExpenseReceipt
} from "@/lib/expenses/types";

import { useRefreshing } from "@/components/shared/refreshing-context";

import {
  formatUtcOffsetForClient,
  transactionToExtracted,
  type LoadError
} from "./task-helpers";

type DraftMap = Record<number, ExtractedExpenseReceipt>;

export type ExpenseDataState = {
  month: string;
  analytics: ExpenseAnalytics | null;
  loadError: LoadError | null;
  pendingDrafts: DraftMap;
  transactionDrafts: DraftMap;
  setPendingDrafts: React.Dispatch<React.SetStateAction<DraftMap>>;
  setTransactionDrafts: React.Dispatch<React.SetStateAction<DraftMap>>;
  reload: () => Promise<void>;
};

export function useExpenseData(month: string): ExpenseDataState {
  const { setRefreshing } = useRefreshing();
  const [analytics, setAnalytics] = useState<ExpenseAnalytics | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState<DraftMap>({});
  const [transactionDrafts, setTransactionDrafts] = useState<DraftMap>({});
  const fetchEpoch = useRef(0);

  const load = useCallback(async () => {
    const isFirstRun = fetchEpoch.current === 0;
    fetchEpoch.current += 1;
    if (!isFirstRun) setRefreshing(true);
    setLoadError(null);
    const tz =
      Intl.DateTimeFormat().resolvedOptions().timeZone || `UTC${formatUtcOffsetForClient()}`;
    const query = new URLSearchParams({
      month,
      tz,
      budget: String(getStoredBudgetCents()),
      primaryCurrency: getStoredPrimaryCurrency()
    });
    let response: Response;
    try {
      response = await fetch(`/api/expenses?${query.toString()}`);
    } catch (err) {
      setLoadError({
        kind: "network",
        message: err instanceof Error ? err.message : "网络请求失败"
      });
      setRefreshing(false);
      return;
    }
    if (!response.ok) {
      setLoadError({
        kind: response.status >= 500 ? "server" : "client",
        message: `服务器返回 ${response.status}`
      });
      setRefreshing(false);
      return;
    }
    try {
      const data = (await response.json()) as ExpenseAnalytics;
      setAnalytics(data);
      setPendingDrafts(
        Object.fromEntries(data.pending_receipts.map((r) => [r.id, r.extracted]))
      );
      setTransactionDrafts(
        Object.fromEntries(
          data.recent_transactions.map((t) => [t.id, transactionToExtracted(t)])
        )
      );
    } catch (err) {
      setLoadError({
        kind: "client",
        message: err instanceof Error ? err.message : "解析响应失败"
      });
    } finally {
      setRefreshing(false);
    }
  }, [month]);

  useEffect(() => {
    load().catch((err) =>
      setLoadError({
        kind: "network",
        message: err instanceof Error ? err.message : "消费数据加载失败"
      })
    );
  }, [load]);

  // Background refresh so /expenses stays close to up-to-date while the
  // user is staring at the budget / category charts. 90s is the cadence
  // the legacy component used.
  useEffect(() => {
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 90_000);
    return () => window.clearInterval(timer);
  }, [load]);

  return {
    month,
    analytics,
    loadError,
    pendingDrafts,
    transactionDrafts,
    setPendingDrafts,
    setTransactionDrafts,
    reload: load
  };
}