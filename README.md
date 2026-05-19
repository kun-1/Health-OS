<!--
Language Toggle: Use radio buttons + CSS to switch EN / 中文
-->
<input type="radio" name="lang" id="lang-en" checked hidden>
<input type="radio" name="lang" id="lang-zh" hidden>

<style>
#readme-en  { display: block; }
#readme-zh  { display: none; }
#lang-zh:checked ~ #readme-en { display: none; }
#lang-zh:checked ~ #readme-zh { display: block; }
.lang-btn {
  display: inline-block;
  cursor: pointer;
  padding: 6px 18px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  border: 1.5px solid #2f6f68;
  background: transparent;
  color: #2f6f68;
  transition: all 0.2s;
  margin: 0 4px;
  user-select: none;
}
.lang-btn:hover { opacity: 0.8; }
#lang-en:checked ~ .lang-bar label[for="lang-en"],
#lang-zh:checked ~ .lang-bar label[for="lang-zh"] {
  background: #2f6f68;
  color: #fff;
}
.lang-bar { text-align: right; margin-bottom: 20px; }
</style>

<div class="lang-bar">
  <label class="lang-btn" for="lang-en">🇬🇧 English</label>
  <label class="lang-btn" for="lang-zh">🇨🇳 中文</label>
</div>

<!-- ==================== ENGLISH ==================== -->
<div id="readme-en">

<p align="center">
  <img src="assets/ChatGPT%20Image%202026%E5%B9%B45%E6%9C%8813%E6%97%A5%2010_32_37.png" alt="Health Monitor" width="700" style="border-radius: 16px; box-shadow: 0 12px 40px rgba(20,35,30,0.12);">
</p>

<h1 align="center">
  <span style="color:#17201c;">Health Monitor</span>
  <span style="font-size:18px; color:#5d6963; font-weight:400; display:block; margin-top:4px;">Personal Health Record &amp; Analysis Layer</span>
</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15.2-black?logo=next.js&style=flat-square" alt="Next.js 15">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&style=flat-square" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&style=flat-square" alt="TypeScript">
  <img src="https://img.shields.io/badge/SQLite-FFD43B?logo=sqlite&style=flat-square" alt="SQLite">
  <img src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&style=flat-square" alt="Drizzle ORM">
  <img src="https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&style=flat-square" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/Zod-3.24-3068B7?logo=zod&style=flat-square" alt="Zod">
  <img src="https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&style=flat-square" alt="PWA">
</p>

<p align="center">
  A <strong>self-hosted</strong>, <strong>privacy-first</strong> health tracking application designed for individuals managing chronic conditions — particularly those exploring the <strong>diet-gut-skin axis</strong>. Built as a Progressive Web App (PWA) for <strong>iPhone</strong>, deployed via <strong>Docker + Tailscale</strong> on a home server.
</p>

---

## 🌟 Highlights

| | |
|---|---|
| 🔒 **100% Private** | All data stays on your device / home server. No cloud, no accounts, no third parties. |
| 📱 **PWA on iPhone** | Add to home screen — works like a native app with standalone display and offline-ready manifest. |
| 🧠 **Insight Engine** | Automatically detects trends, flags meal reactions, and evaluates data quality — no manual analysis needed. |
| ⚡ **Focused Capture** | Record a meal, symptom, or bowel movement in under 15 seconds. Literally designed for lazy people. |
| 🏠 **Self-Hosted** | Docker → Tailscale → your homelab. Full control, zero subscription. |

---

## ✨ Features

### 📝 8-Type Event Capture

| Type | Fields |
|------|--------|
| **Meal** | Food text/items, cooking method, hunger/stress before, processed food flags, additives, portion size |
| **Supplement** | Name, brand, dose, taken-with-meal flag |
| **Post-meal Symptom** | Bloating, pain, reflux, heaviness, gas (0-4 scales) — linked to a meal |
| **Bowel** | Bristol type (1-7), strain (0-3), urgency, incomplete emptying, blood flags |
| **Water** | Amount in ml, drink type, optional urine color |
| **Nosebleed** | Side, amount, duration — for tracking low-frequency events |
| **Daily Summary** | Skin scores (redness/scaling/itch), nasal blockage, stress peak, fiber diversity |
| **Sleep** | Duration, quality, awakenings, disruption type |

Every form follows a **lazy-recording philosophy**: answer the primary question, hit save. Optional details are truly optional.

### 📊 Dashboard & Timeline

- **Today Dashboard** — Quick stats, quick-capture grid, recent records, daily summary status
- **Timeline** — Reverse-chronological paginated feed with edit/delete support

### 🔬 Analysis & Insights

- **Data Quality Assessment** — Coverage ratios for each record type, recording consistency
- **Trend Detection** — 7-day rolling averages for skin, sleep, stress, water, bowel consistency
- **Meal Reaction Watchlist** — Compares bloating/pain between exposed vs unexposed meals (processed food, additives, deep-fry, large portions, high stress)
- **Safety Notes** — Flags blood in stool or other warning signs

### 📈 Trends Visualization

6 core metrics visualized with 14-day bar charts, directional indicators, and a full daily metrics table. All rendered with pure HTML/CSS — zero charting libraries.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────┐
│                  iPhone (PWA)                    │
│         Safari → Add to Home Screen              │
└──────────────────┬──────────────────────────────┘
                   │ Tailscale
┌──────────────────▼──────────────────────────────┐
│              Home Server (N100)                  │
│  ┌───────────────────────────────────────────┐   │
│  │           Docker Container                 │   │
│  │  ┌─────────┐  ┌──────────────────────┐   │   │
│  │  │ Next.js │  │   SQLite (WAL mode)  │   │   │
│  │  │ 15.2    │──│   data/app.db         │   │   │
│  │  │         │  │                      │   │   │
│  │  │ API     │  │  Table: records       │   │   │
│  │  │ Routes  │  │  - id / type          │   │   │
│  │  │         │  │  - occurred_at         │   │   │
│  │  │ Drizzle │  │  - payload_json        │   │   │
│  │  │ ORM     │  │  - created / updated   │   │   │
│  │  └─────────┘  └──────────────────────┘   │   │
│  └───────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Next.js 15](https://nextjs.org/) (App Router) |
| **UI Library** | [React 19](https://react.dev/) |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com/) + custom utility classes |
| **Database** | [SQLite](https://www.sqlite.org/) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team/) |
| **Validation** | [Zod 3](https://zod.dev/) |
| **Language** | [TypeScript 5.8](https://www.typescriptlang.org/) (strict mode) |
| **PWA** | Web manifest, apple-touch-icon, standalone display |
| **Deployment** | Docker, Docker Compose, [Tailscale](https://tailscale.com/) |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Local Development

```bash
# Clone the repository
git clone https://github.com/kun-1/health_monitor.git
cd health_monitor

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

Set the `SQLITE_PATH` environment variable to customize the database location (default: `./data/app.db`).

---

## 📁 Project Structure

```
src/
├── app/
│   ├── api/            # REST API routes (records, insights, trends)
│   ├── decisions/      # Placeholder for future decision layer
│   ├── insights/       # Analysis & insight page
│   ├── record/         # Data capture page
│   ├── settings/       # Placeholder for settings
│   ├── timeline/       # Event timeline page
│   ├── trends/         # Trend visualization page
│   ├── globals.css     # Custom design system
│   ├── layout.tsx      # Root layout with navigation
│   ├── manifest.ts     # PWA manifest generator
│   └── page.tsx        # Today dashboard
├── components/
│   ├── form-controls.tsx              # Segmented, Score, TriState controls
│   ├── insights-client.tsx            # Insights page client component
│   ├── placeholder-page.tsx           # Empty state placeholder
│   ├── record-client.tsx              # Record capture client component
│   ├── timeline-client.tsx            # Timeline client component
│   ├── today-dashboard-client.tsx     # Dashboard client component
│   └── trends-client.tsx              # Trends client component
├── db/
│   └── schema.ts       # Drizzle ORM schema
└── lib/
    ├── analysis/        # Insight engine, trend derivation, date utilities
    ├── records/         # Store, validation, summarization
    └── db.ts            # Database connection & setup
```

---

## 📜 License

MIT

---

<p align="center">
  <sub>Built with ❤️ for personal health sovereignty. No diagnosis, no warranty — just data you control.</sub>
</p>

</div>

<!-- ==================== 中文 ==================== -->
<div id="readme-zh">

<p align="center">
  <img src="assets/ChatGPT%20Image%202026%E5%B9%B45%E6%9C%8813%E6%97%A5%2010_32_37.png" alt="Health Monitor" width="700" style="border-radius: 16px; box-shadow: 0 12px 40px rgba(20,35,30,0.12);">
</p>

<h1 align="center">
  <span style="color:#17201c;">Health Monitor</span>
  <span style="font-size:18px; color:#5d6963; font-weight:400; display:block; margin-top:4px;">个人健康记录与分析层</span>
</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15.2-black?logo=next.js&style=flat-square" alt="Next.js 15">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&style=flat-square" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&style=flat-square" alt="TypeScript">
  <img src="https://img.shields.io/badge/SQLite-FFD43B?logo=sqlite&style=flat-square" alt="SQLite">
  <img src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&style=flat-square" alt="Drizzle ORM">
  <img src="https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&style=flat-square" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/Zod-3.24-3068B7?logo=zod&style=flat-square" alt="Zod">
  <img src="https://img.shields.io/badge/PWA-Ready-5A0FC8?logo=pwa&style=flat-square" alt="PWA">
</p>

<p align="center">
  一个<strong>自部署</strong>、<strong>隐私优先</strong>的健康追踪应用，专为需要管理慢性问题的个人设计——特别是关注<strong>饮食-肠道-皮肤轴</strong>的用户。以 PWA 形式运行在 <strong>iPhone</strong> 上，通过 <strong>Docker + Tailscale</strong> 部署在家用服务器。
</p>

---

## 🌟 亮点

| | |
|---|---|
| 🔒 **100% 隐私** | 所有数据留在你的设备/家庭服务器上。无云、无账号、无第三方。 |
| 📱 **iPhone PWA** | 添加到主屏幕——独立显示、离线 Manifest，体验接近原生。 |
| 🧠 **洞察引擎** | 自动检测趋势、标记饮食反应、评估数据质量——无需手动分析。 |
| ⚡ **极速记录** | 记录一餐、一个症状或一次排便不超过 15 秒。专为「懒人」设计。 |
| 🏠 **自部署** | Docker → Tailscale → 你的家庭服务器。完全掌控，零订阅费。 |

---

## ✨ 功能

### 📝 8 种事件记录

| 类型 | 字段 |
|------|------|
| **饮食** | 食物文本/条目、烹饪方式、饥饿/压力水平、加工食品标记、添加剂、份量 |
| **补剂** | 名称、品牌、剂量、是否随餐服用 |
| **餐后症状** | 腹胀、疼痛、反酸、沉重感、胀气 (0-4 级) — 关联到某餐 |
| **排便** | 布里斯托类型 (1-7)、用力程度 (0-3)、急迫感、排空感、便血 |
| **饮水** | 毫升数、饮品类型、可选尿液颜色 |
| **鼻出血** | 侧别、量、持续时间 — 用于低频事件追踪 |
| **每日总结** | 皮肤评分（红/脱屑/痒）、鼻塞、压力峰值、纤维多样性 |
| **睡眠** | 时长、质量、夜醒次数、干扰类型 |

每种表单遵循 **懒人记录哲学**：回答核心问题，保存。可选信息永远可选。

### 📊 仪表盘与时间线

- **今日仪表盘** — 快捷统计、快速记录入口、最近记录、每日总结状态
- **时间线** — 逆序分页事件流，支持编辑/删除

### 🔬 分析与洞察

- **数据质量评估** — 每种记录类型的覆盖率和记录一致性
- **趋势检测** — 皮肤、睡眠、压力、饮水、排便一致性的 7 日滚动平均
- **饮食反应看板** — 比较暴露/非暴露餐后的腹胀/疼痛差异（加工食品、添加剂、油炸、大份量、高压力）
- **安全提醒** — 标记便血等警示信号

### 📈 趋势可视化

6 个核心指标以 14 日柱状图呈现，附带方向指示器和完整日指标表格。纯 HTML/CSS 渲染——零图表库依赖。

---

## 🏗 架构

```
┌─────────────────────────────────────────────────┐
│                  iPhone (PWA)                    │
│         Safari → 添加到主屏幕                     │
└──────────────────┬──────────────────────────────┘
                   │ Tailscale
┌──────────────────▼──────────────────────────────┐
│              家庭服务器 (N100)                    │
│  ┌───────────────────────────────────────────┐   │
│  │           Docker 容器                      │   │
│  │  ┌─────────┐  ┌──────────────────────┐   │   │
│  │  │ Next.js │  │   SQLite (WAL 模式)   │   │   │
│  │  │ 15.2    │──│   data/app.db         │   │   │
│  │  │         │  │                      │   │   │
│  │  │ API     │  │  表: records          │   │   │
│  │  │ 路由    │  │  - id / type          │   │   │
│  │  │         │  │  - occurred_at         │   │   │
│  │  │ Drizzle │  │  - payload_json        │   │   │
│  │  │ ORM     │  │  - created / updated   │   │   │
│  │  └─────────┘  └──────────────────────┘   │   │
│  └───────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| **框架** | [Next.js 15](https://nextjs.org/) (App Router) |
| **UI 库** | [React 19](https://react.dev/) |
| **样式** | [Tailwind CSS 3](https://tailwindcss.com/) + 自定义工具类 |
| **数据库** | [SQLite](https://www.sqlite.org/) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team/) |
| **验证** | [Zod 3](https://zod.dev/) |
| **语言** | [TypeScript 5.8](https://www.typescriptlang.org/) (严格模式) |
| **PWA** | Web manifest、apple-touch-icon、standalone 显示 |
| **部署** | Docker、Docker Compose、[Tailscale](https://tailscale.com/) |

---

## 🚀 快速开始

### 前置要求

- Node.js 20+
- npm 10+

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/kun-1/health_monitor.git
cd health_monitor

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000)。

### 生产构建

```bash
npm run build
npm start
```

通过 `SQLITE_PATH` 环境变量自定义数据库路径（默认: `./data/app.db`）。

---

## 📁 项目结构

```
src/
├── app/
│   ├── api/            # REST API 路由 (records, insights, trends)
│   ├── decisions/      # 预留决策层占位
│   ├── insights/       # 分析与洞察页面
│   ├── record/         # 数据录入页面
│   ├── settings/       # 预留设置占位
│   ├── timeline/       # 事件时间线页面
│   ├── trends/         # 趋势可视化页面
│   ├── globals.css     # 自定义设计系统
│   ├── layout.tsx      # 根布局与导航
│   ├── manifest.ts     # PWA Manifest 生成
│   └── page.tsx        # 今日仪表盘
├── components/
│   ├── form-controls.tsx           # Segmented、Score、TriState 表单控件
│   ├── insights-client.tsx         # 洞察页面客户端组件
│   ├── placeholder-page.tsx        # 空状态占位
│   ├── record-client.tsx           # 记录录入客户端组件
│   ├── timeline-client.tsx         # 时间线客户端组件
│   ├── today-dashboard-client.tsx  # 仪表盘客户端组件
│   └── trends-client.tsx           # 趋势客户端组件
├── db/
│   └── schema.ts       # Drizzle ORM 数据库模式
└── lib/
    ├── analysis/        # 洞察引擎、趋势推导、日期工具
    ├── records/         # 存储、验证、摘要生成
    └── db.ts            # 数据库连接与初始化
```

---

## 📜 许可证

MIT

---

<p align="center">
  <sub>为个人健康主权而建。不提供诊断，不提供担保——只有你掌控的数据。</sub>
</p>

</div>
