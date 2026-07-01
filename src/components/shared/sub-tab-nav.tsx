"use client";

/**
 * Shared tablist nav used by /expenses and /nutrition to switch between
 * in-page sub-tasks. Generic over the tab id type so each caller keeps
 * its own literal union.
 */

import type { ComponentType } from "react";

export type SubTab<T extends string> = {
  id: T;
  label: string;
  icon: ComponentType<{ "aria-hidden"?: boolean }>;
};

type Props<T extends string> = {
  tabs: ReadonlyArray<SubTab<T>>;
  activeTab: T;
  onTabChange: (id: T) => void;
  /** ARIA label for the nav element. */
  ariaLabel: string;
  /** CSS class on the nav element. Default: "exp-tasknav" */
  className?: string;
  /** Prefix for the button id (e.g. "exp-tab", "nut-task-tab"). */
  idPrefix: string;
  /**
   * If provided, renders `aria-controls` pointing at `${panelIdPrefix}-${tab.id}`.
   * Use this together with a `role="tabpanel"` element that has
   * `id="${panelIdPrefix}-${tab.id}"` and `aria-labelledby` referencing the tab.
   */
  panelIdPrefix?: string;
};

export function SubTabNav<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  className = "exp-tasknav",
  idPrefix,
  panelIdPrefix
}: Props<T>) {
  return (
    <nav aria-label={ariaLabel} className={className} role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeTab;
        const buttonId = `${idPrefix}-${tab.id}`;
        return (
          <button
            aria-controls={panelIdPrefix ? `${panelIdPrefix}-${tab.id}` : undefined}
            aria-selected={isActive}
            className="exp-tasknav__item"
            data-active={isActive ? "true" : undefined}
            id={buttonId}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            role="tab"
            type="button"
          >
            <Icon aria-hidden />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}