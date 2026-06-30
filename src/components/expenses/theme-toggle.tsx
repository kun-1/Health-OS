"use client";

/**
 * Theme toggle used only on legacy expenses surfaces (login-form and
 * recurring-manager-client). Intentionally NOT mounted in the Life OS
 * topbar — the Phase A Life OS IA does not expose a theme switch, since
 * theme control belongs in user settings (not yet built) rather than as
 * a global topbar action. Keep this component around for the legacy
 * pages until they migrate or get removed.
 */
type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("expenses-theme") as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (next: Theme) => void }) {
  // Wave 3 polish (M8): render the icon unconditionally. The previous
  // `mounted` gating meant the first click on a freshly mounted toggle could
  // race with the post-mount re-render and silently no-op. The current
  // `theme` prop is already the correct initial value (light until
  // useEffect in ExpensesClient swaps it), so SSR / hydration stays clean.
  const isDark = theme === "dark";

  return (
    <button
      aria-label={isDark ? "切换到亮色" : "切换到暗色"}
      className="exp-theme-toggle"
      onClick={() => onChange(isDark ? "light" : "dark")}
      type="button"
    >
      {isDark ? (
        <svg fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" fill="currentColor" r="4" />
          <g stroke="currentColor" strokeLinecap="round" strokeWidth="2">
            <line x1="12" x2="12" y1="2" y2="4" />
            <line x1="12" x2="12" y1="20" y2="22" />
            <line x1="2" x2="4" y1="12" y2="12" />
            <line x1="20" x2="22" y1="12" y2="12" />
            <line x1="4.93" x2="6.34" y1="4.93" y2="6.34" />
            <line x1="17.66" x2="19.07" y1="17.66" y2="19.07" />
            <line x1="4.93" x2="6.34" y1="19.07" y2="17.66" />
            <line x1="17.66" x2="19.07" y1="6.34" y2="4.93" />
          </g>
        </svg>
      ) : (
        <svg fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}

export { getInitialTheme };
export type { Theme };
