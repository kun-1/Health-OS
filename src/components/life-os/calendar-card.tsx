import "./life-os.css";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

type Props = {
  /** Override the reference date (defaults to today). Useful for testing. */
  referenceDate?: Date;
  /** ISO date strings ("YYYY-MM-DD") that have spending activity. Phase A1
   *  receives an empty array; Phase A2 will thread `daily_totals` in. */
  activeDays?: ReadonlyArray<string>;
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function CalendarCard({ referenceDate, activeDays = [] }: Props) {
  const ref = referenceDate ?? new Date();
  const year = ref.getFullYear();
  const month = ref.getMonth(); // 0-based

  // First weekday of the month (0 = Sun) and total days in month.
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = iso(ref);
  const activeSet = new Set(activeDays);

  const cells: Array<{ key: string; label: number | null; muted?: boolean }> = [];

  // Leading muted days from previous month.
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = firstWeekday - 1; i >= 0; i--) {
    cells.push({ key: `prev-${i}`, label: prevMonthDays - i, muted: true });
  }
  // Current month days.
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ key: iso(new Date(year, month, d)), label: d });
  }
  // Trailing muted days to fill a 6-row grid (42 cells).
  while (cells.length % 7 !== 0) {
    cells.push({ key: `next-${cells.length}`, label: cells.length - daysInMonth - firstWeekday + 1, muted: true });
  }
  while (cells.length < 42) {
    cells.push({ key: `next-${cells.length}`, label: cells.length - daysInMonth - firstWeekday + 1, muted: true });
  }

  const monthLabel = `${year} 年 ${month + 1} 月`;

  return (
    <section className="life-card">
      <header className="life-card__header">
        <span className="life-card__title">日历</span>
        <span style={{ fontSize: "0.78rem", color: "var(--life-muted)", fontWeight: 700 }}>
          {monthLabel}
        </span>
      </header>
      <div className="life-calendar" role="grid" aria-label={`${monthLabel} 日历`}>
        {WEEKDAYS.map((w) => (
          <div key={`hdr-${w}`} className="life-calendar__cell life-calendar__cell--header" role="columnheader">
            {w}
          </div>
        ))}
        {cells.map((cell) => {
          if (cell.label === null) return <div key={cell.key} className="life-calendar__cell" />;
          const isToday = cell.key === todayKey;
          const hasData = !cell.muted && activeSet.has(cell.key);
          const classes = [
            "life-calendar__cell",
            cell.muted ? "life-calendar__cell--muted" : "",
            isToday ? "life-calendar__cell--today" : "",
            hasData ? "life-calendar__cell--has-data" : ""
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div key={cell.key} className={classes} role="gridcell">
              {cell.label}
            </div>
          );
        })}
      </div>
      <div className="life-calendar__legend">
        <span className="life-calendar__legend-dot" aria-hidden />
        <span>当天有支出（Phase A1 占位）</span>
      </div>
    </section>
  );
}