"use client";

import { useState } from "react";

import "./od-home.css";

type Kind = "health" | "nutrition" | "spending" | "sleep" | "risk" | "muted";

export type ODActivityEntry = {
  id: string;
  text: string;
  meta: string;
  kind: Kind;
  /** When true, the entry is treated as a "transaction" and surfaces in
   *  the 近期交易 tab. */
  isTransaction?: boolean;
};

type Props = {
  entries: ReadonlyArray<ODActivityEntry>;
};

const KIND_LABEL: Record<Kind, string> = {
  health: "健康",
  nutrition: "营养",
  spending: "支出",
  sleep: "睡眠",
  risk: "提醒",
  muted: "其他"
};

function dotClass(kind: Kind): string {
  return `od-activity-dot ${kind}`;
}

type Tab = "activity" | "recent-tx";

/** Activity stream + recent-tx tabs. Both lists are filtered out of the
 *  same `entries` prop so the OD topbar's "近期交易" tab is always a
 *  subset of "活动流". */
export function ODActivityTabs({ entries }: Props) {
  const [tab, setTab] = useState<Tab>("activity");

  const filtered = tab === "recent-tx" ? entries.filter((e) => e.isTransaction) : entries;

  return (
    <>
      <div className="od-card-head">
        <div className="od-activity-tabs" role="tablist">
          <button
            aria-selected={tab === "activity"}
            className={`od-activity-tab${tab === "activity" ? " is-active" : ""}`}
            onClick={() => setTab("activity")}
            role="tab"
            type="button"
          >
            活动流
          </button>
          <button
            aria-selected={tab === "recent-tx"}
            className={`od-activity-tab${tab === "recent-tx" ? " is-active" : ""}`}
            onClick={() => setTab("recent-tx")}
            role="tab"
            type="button"
          >
            近期交易
          </button>
        </div>
        <div className="od-card-actions">
          <button
            className="ghost"
            onClick={() => {
              // No-op: entries are derived from props, not state. The clear
              // button is preserved for visual parity with the OD ref; the
              // activity stream re-derives on each render anyway.
            }}
            type="button"
          >
            清空
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="od-activity-empty">
          {tab === "recent-tx" ? "暂无近期交易" : "还没有可观察的动态"}
        </div>
      ) : (
        <ul className="od-activity-list">
          {filtered.map((entry) => (
            <li className="od-activity-item" key={entry.id}>
              <span className={dotClass(entry.kind)} aria-hidden />
              <div className="od-activity-body">
                <div className="od-activity-text">{entry.text}</div>
                <div className="od-activity-meta">
                  {KIND_LABEL[entry.kind]} · {entry.meta}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
