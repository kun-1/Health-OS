<p align="center">
  <img src="assets/ChatGPT%20Image%202026%E5%B9%B45%E6%9C%8813%E6%97%A5%2010_32_37.png" alt="Health Monitor" width="700" style="border-radius: 16px;">
</p>

<h1 align="center">Health Monitor<br><sub>Personal Health Record &amp; Analysis Layer</sub></h1>

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

<br>

<!-- ==================== LANGUAGE TOGGLE ==================== -->

<details open>
<summary>🇬🇧 English</summary>

<br>

A **self-hosted**, **privacy-first** health tracking application for individuals managing chronic conditions — particularly those exploring the **diet-gut-skin axis**. Built as a PWA for **iPhone**, deployed via **Docker + Tailscale** on a home server.

## 🌟 Highlights

| | |
|---|---|
| 🔒 **100% Private** | All data stays on your device / home server. No cloud, no accounts, no third parties. |
| 📱 **PWA on iPhone** | Add to home screen — standalone display, offline-ready manifest. |
| 🧠 **Insight Engine** | Automatically detects trends, flags meal reactions, evaluates data quality. |
| ⚡ **Focused Capture** | Record a meal, symptom, or bowel movement in under 15 seconds. |
| 🏠 **Self-Hosted** | Docker → Tailscale → your homelab. Full control, zero subscription. |

## ✨ Features

### 📝 8-Type Event Capture

| Type | Fields |
|------|--------|
| **Meal** | Food text/items, cooking method, hunger/stress before, processed food flags, additives, portion size |
| **Supplement** | Name, brand, dose, taken-with-meal flag |
| **Post-meal Symptom** | Bloating, pain, reflux, heaviness, gas (0-4) — linked to a meal |
| **Bowel** | Bristol type (1-7), strain (0-3), urgency, incomplete emptying, blood flags |
| **Water** | Amount in ml, drink type, optional urine color |
| **Nosebleed** | Side, amount, duration — low-frequency event tracking |
| **Daily Summary** | Skin scores (redness/scaling/itch), nasal blockage, stress peak, fiber diversity |
| **Sleep** | Duration, quality, awakenings, disruption type |

Every form follows a **lazy-recording philosophy**: answer the primary question, hit save. Optional details are truly optional.

### 📊 Dashboard & Timeline

- **Today Dashboard** — Quick stats, quick-capture grid, recent records, daily summary status
- **Timeline** — Reverse-chronological paginated feed with edit/delete

### 🔬 Analysis & Insights

- **Data Quality Assessment** — Coverage ratios for each record type
- **Trend Detection** — 7-day rolling averages for skin, sleep, stress, water, bowel
- **Meal Reaction Watchlist** — Compares bloating/pain between exposed vs unexposed meals (processed food, additives, deep-fry, large portions, high stress)
- **Safety Notes** — Flags blood in stool or other warning signs

### 📈 Trends Visualization

6 core metrics with 14-day bar charts, directional indicators, and a daily metrics table. All rendered with pure HTML/CSS — zero charting libraries.

## 🏗 Architecture

```
┌──────────────────────────────────────────┐
│              iPhone (PWA)                 │
│     Safari → Add to Home Screen          │
└──────────────────┬───────────────────────┘
                   │ Tailscale
┌──────────────────▼───────────────────────┐
│          Home Server (N100)               │
│  ┌───────────────────────────────────┐   │
│  │         Docker Container          │   │
│  │  ┌──────────┐ ┌──────────────┐   │   │
│  │  │ Next.js  │ │SQLite (WAL)  │   │   │
│  │  │ 15.2     │─│ data/app.db  │   │   │
│  │  │          │ │              │   │   │
│  │  │API Routes│ │ records      │   │   │
│  │  │Drizzle   │ │ table        │   │   │
│  │  └──────────┘ └──────────────┘   │   │
│  └───────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Next.js 15](https://nextjs.org/) (App Router) |
| **UI** | [React 19](https://react.dev/) |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com/) + custom utilities |
| **Database** | [SQLite](https://sqlite.org/) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team/) |
| **Validation** | [Zod 3](https://zod.dev/) |
| **Language** | [TypeScript 5.8](https://www.typescriptlang.org/) (strict) |
| **PWA** | Web manifest, apple-touch-icon, standalone display |
| **Deployment** | Docker, Docker Compose, [Tailscale](https://tailscale.com/) |

## 🚀 Getting Started

```bash
# Prerequisites: Node.js 20+, npm 10+
git clone https://github.com/kun-1/health_monitor.git
cd health_monitor
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Set `SQLITE_PATH` env var to customize the database path (default: `./data/app.db`).

## 📁 Project Structure

```
src/
├── app/
│   ├── api/            # REST API (records, insights, trends)
│   ├── record/         # Data capture page
│   ├── timeline/       # Event timeline
│   ├── insights/       # Analysis & insight page
│   ├── trends/         # Trend visualization
│   ├── decisions/      # Placeholder
│   └── settings/       # Placeholder
├── components/         # React client components
├── db/                 # Drizzle schema
└── lib/
    ├── analysis/       # Insight engine, trend derivation
    ├── records/        # Store, validation, summarization
    └── db.ts           # Database setup
```

## 📜 License

MIT

<p align="center"><sub>Built for personal health sovereignty. No diagnosis, no warranty — just data you control.</sub></p>

</details>

<details>
<summary>🇨🇳 中文</summary>

<br>

一个**自部署**、**隐私优先**的健康追踪应用，专为需要管理慢性问题的个人设计——特别是关注**饮食-肠道-皮肤轴**的用户。以 PWA 形式运行在 **iPhone** 上，通过 **Docker + Tailscale** 部署在家用服务器。

## 🌟 亮点

| | |
|---|---|
| 🔒 **100% 隐私** | 所有数据留在你的设备/家庭服务器上。无云、无账号、无第三方。 |
| 📱 **iPhone PWA** | 添加到主屏幕——独立显示、离线 Manifest，体验接近原生。 |
| 🧠 **洞察引擎** | 自动检测趋势、标记饮食反应、评估数据质量——无需手动分析。 |
| ⚡ **极速记录** | 记录一餐、一个症状或一次排便不超过 15 秒。专为「懒人」设计。 |
| 🏠 **自部署** | Docker → Tailscale → 你的家庭服务器。完全掌控，零订阅费。 |

## ✨ 功能

### 📝 8 种事件记录

| 类型 | 字段 |
|------|------|
| **饮食** | 食物文本/条目、烹饪方式、饥饿/压力水平、加工食品标记、添加剂、份量 |
| **补剂** | 名称、品牌、剂量、是否随餐服用 |
| **餐后症状** | 腹胀、疼痛、反酸、沉重感、胀气 (0-4) — 关联到某餐 |
| **排便** | 布里斯托类型 (1-7)、用力程度 (0-3)、急迫感、排空感、便血 |
| **饮水** | 毫升数、饮品类型、可选尿液颜色 |
| **鼻出血** | 侧别、量、持续时间 — 低频事件追踪 |
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

## 🏗 架构

```
┌──────────────────────────────────────────┐
│              iPhone (PWA)                 │
│      Safari → 添加到主屏幕                │
└──────────────────┬───────────────────────┘
                   │ Tailscale
┌──────────────────▼───────────────────────┐
│          家庭服务器 (N100)                 │
│  ┌───────────────────────────────────┐   │
│  │          Docker 容器              │   │
│  │  ┌──────────┐ ┌──────────────┐   │   │
│  │  │ Next.js  │ │SQLite (WAL)  │   │   │
│  │  │ 15.2     │─│ data/app.db  │   │   │
│  │  │          │ │              │   │   │
│  │  │API 路由   │ │ records 表   │   │   │
│  │  │Drizzle   │ │              │   │   │
│  │  └──────────┘ └──────────────┘   │   │
│  └───────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| **框架** | [Next.js 15](https://nextjs.org/) (App Router) |
| **UI** | [React 19](https://react.dev/) |
| **样式** | [Tailwind CSS 3](https://tailwindcss.com/) + 自定义工具类 |
| **数据库** | [SQLite](https://sqlite.org/) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team/) |
| **验证** | [Zod 3](https://zod.dev/) |
| **语言** | [TypeScript 5.8](https://www.typescriptlang.org/) (严格模式) |
| **PWA** | Web manifest、apple-touch-icon、standalone 显示 |
| **部署** | Docker、Docker Compose、[Tailscale](https://tailscale.com/) |

## 🚀 快速开始

```bash
# 前置要求: Node.js 20+, npm 10+
git clone https://github.com/kun-1/health_monitor.git
cd health_monitor
npm install
npm run dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000)。通过 `SQLITE_PATH` 环境变量自定义数据库路径（默认: `./data/app.db`）。

## 📁 项目结构

```
src/
├── app/
│   ├── api/            # REST API (records, insights, trends)
│   ├── record/         # 数据录入页面
│   ├── timeline/       # 事件时间线
│   ├── insights/       # 分析与洞察
│   ├── trends/         # 趋势可视化
│   ├── decisions/      # 预留
│   └── settings/       # 预留
├── components/         # React 客户端组件
├── db/                 # Drizzle 数据库模式
└── lib/
    ├── analysis/       # 洞察引擎、趋势推导
    ├── records/        # 存储、验证、摘要
    └── db.ts           # 数据库初始化
```

## 📜 许可证

MIT

<p align="center"><sub>为个人健康主权而建。不提供诊断，不提供担保——只有你掌控的数据。</sub></p>

</details>
