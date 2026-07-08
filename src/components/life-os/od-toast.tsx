"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import "./od-home.css";

type ToastContextValue = {
  show: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue>({ show: () => undefined });

/** Lightweight non-destructive toast for "feature not yet wired" / status messages.
 *  Used in place of `window.alert` for the OD control affordances. */
export function ODToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: string) => {
    setMessage(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={`od-toast${message ? " show" : ""}`} role="status" aria-live="polite">
        {message}
      </div>
    </ToastContext.Provider>
  );
}

export function useODToast(): ToastContextValue {
  return useContext(ToastContext);
}
