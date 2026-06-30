import { CircleDollarSign, Clock3, ReceiptText, Salad, TrendingUp } from "lucide-react";

import { ActivityCard } from "./activity-card";
import { CalendarCard } from "./calendar-card";
import { ChartCard } from "./chart-card";
import { LifeShell } from "./life-shell";
import { MetricCard } from "./metric-card";
import "./life-os.css";

/**
 * Phase A1 home page: shell + KPI placeholders + empty trend + calendar +
 * empty activity list. No API calls. Phase A2 replaces the placeholders
 * with real nutrition / expense data.
 */
export function LifeHome() {
  return (
    <LifeShell>
      <div className="life-home">
        <div className="life-home__primary">
          {/* Row 1 — KPI cards. Nutrition Score is highlighted per the
              reference image: green gradient, biggest visual weight. */}
          <section className="life-home__kpis" aria-label="关键指标">
            <MetricCard
              title="营养评分"
              value="—"
              delta={<>本月待接入</>}
              footnote="基于月度购买 / 票据数据反映饮食结构倾向，不等于每日摄入"
              icon={<Salad strokeWidth={2} />}
              variant="highlight"
              href="/nutrition"
            />
            <MetricCard
              title="今日支出"
              value="¥0"
              delta={<>本月 ¥—</>}
              footnote="A2 接入 expense analytics.daily_totals"
              icon={<CircleDollarSign strokeWidth={2} />}
              href="/expenses"
            />
            <MetricCard
              title="食物支出占比"
              value="—"
              delta={<>6 个月趋势待接入</>}
              footnote="食物 + 外食 + 饮料咖啡 ÷ 总支出"
              icon={<TrendingUp strokeWidth={2} />}
            />
            <MetricCard
              title="待处理票据"
              value="—"
              delta={<>队列状态待接入</>}
              footnote="OCR 完成等待确认或失败的票据"
              icon={<ReceiptText strokeWidth={2} />}
              href="/expenses?task=receipts"
            />
          </section>

          {/* Row 2 — main trend chart placeholder. A2 will render a real
              Recharts area chart with nutrition + spend series. */}
          <ChartCard
            title="营养评分 · 支出趋势"
            subtitle="近 6 个月"
            toolbar={
              <span className="life-topbar__chip" aria-hidden>
                <Clock3 strokeWidth={2} style={{ width: 14, height: 14 }} />
                A2 接入
              </span>
            }
            footer="A2 将叠加 PDI / AHEI / Plate / UPF 四条子线，与月度消费曲线并列。"
          >
            <div className="life-chart-placeholder">主趋势图占位 · Phase A2 接入 Recharts</div>
          </ChartCard>

          {/* Row 3 — two cards: recent transactions + nutrition signal */}
          <section className="life-home__bottom" aria-label="详情卡片">
            <section className="life-card">
              <header className="life-card__header">
                <span className="life-card__title">最近交易</span>
              </header>
              <div className="life-chart-placeholder" style={{ minHeight: 160 }}>
                A2 接入 expenses.recent_transactions
              </div>
            </section>
            <section className="life-card">
              <header className="life-card__header">
                <span className="life-card__title">营养结构 / 异常信号</span>
              </header>
              <div className="life-chart-placeholder" style={{ minHeight: 160 }}>
                A2 接入 nutrition PDI / AHEI / Plate / UPF
              </div>
            </section>
          </section>
        </div>

        <aside className="life-home__aside" aria-label="侧栏">
          <CalendarCard />
          <ActivityCard entries={[]} />
        </aside>
      </div>
    </LifeShell>
  );
}