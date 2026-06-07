"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type BulkItemKind = "receipt" | "transaction";

export type BulkItem = {
  id: number;
  kind: BulkItemKind;
};

type BulkSelectionContextValue = {
  items: BulkItem[];
  selectedIds: Set<number>;
  isSelected: (id: number) => boolean;
  handleClick: (id: number, shiftKey: boolean) => void;
  clear: () => void;
  lastClickedId: number | null;
};

const BulkSelectionContext = createContext<BulkSelectionContextValue | null>(null);

type ProviderProps = {
  items: BulkItem[];
  // Wave 3 bulk: bump this to drop the selection — we use it to clear on
  // data reloads (e.g. month change) so stale IDs don't linger.
  clearKey: string;
  children: React.ReactNode;
};

export function BulkSelectionProvider({ items, clearKey, children }: ProviderProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [lastClickedId, setLastClickedId] = useState<number | null>(null);

  useEffect(() => {
    setSelectedIds(new Set());
    setLastClickedId(null);
  }, [clearKey]);

  const handleClick = useCallback(
    (id: number, shiftKey: boolean) => {
      if (shiftKey && lastClickedId !== null) {
        const lastIndex = items.findIndex((it) => it.id === lastClickedId);
        const curIndex = items.findIndex((it) => it.id === id);
        if (lastIndex !== -1 && curIndex !== -1) {
          const [from, to] = lastIndex <= curIndex ? [lastIndex, curIndex] : [curIndex, lastIndex];
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (let i = from; i <= to; i += 1) {
              next.add(items[i].id);
            }
            return next;
          });
          setLastClickedId(id);
          return;
        }
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastClickedId(id);
    },
    [items, lastClickedId]
  );

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setLastClickedId(null);
  }, []);

  const isSelected = useCallback((id: number) => selectedIds.has(id), [selectedIds]);

  const value = useMemo<BulkSelectionContextValue>(
    () => ({ items, selectedIds, isSelected, handleClick, clear, lastClickedId }),
    [items, selectedIds, isSelected, handleClick, clear, lastClickedId]
  );

  return <BulkSelectionContext.Provider value={value}>{children}</BulkSelectionContext.Provider>;
}

export function useBulkSelection(): BulkSelectionContextValue {
  const ctx = useContext(BulkSelectionContext);
  if (!ctx) throw new Error("useBulkSelection must be used inside <BulkSelectionProvider>");
  return ctx;
}

export function useBulkSelectionOptional(): BulkSelectionContextValue | null {
  return useContext(BulkSelectionContext);
}
