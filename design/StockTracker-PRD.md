# Stock Tracker - Product Requirements Document (PRD)

## 1. Executive Summary & Goals

**Stock Tracker** is a lightweight, personal web application designed to give the solo user a consolidated view of their stock investments across multiple trading accounts.  

The core problem it solves is the loss of discipline around original investment theses: users often buy stocks with a clear **target exit price** and **target exit date** in mind but forget or drift from that plan over time.  

### Core Objectives
- **Consolidation:** Provide a single source of truth for portfolio value, P/L, and asset allocation across accounts.
- **Plan Accountability:** Enforce structured exit strategies on every purchase and surface timely warnings.
- **AI-Augmented Insights:** Generate high-quality, data-rich prompts that the user can copy-paste into external LLMs (ChatGPT, Claude, etc.) for periodic strategic reviews.
- Deliver a fast, reliable, local-first experience on macOS with minimal maintenance.

**Vision:** A simple yet powerful personal tool that helps the user become a more disciplined investor.

## 2. User Personas & Scope

### User Persona
- **Primary User:** The application creator — an individual investor managing personal brokerage accounts. Tech-savvy enough to run a local full-stack app.

### In Scope
- Local-only deployment on MacBook (accessed via `localhost`).
- Single-user, no authentication.
- CRUD for accounts, transactions, and exit plans.
- Portfolio analytics and visual alerts.
- AI Prompt generation engine.
- Data import/export and backups.

### Out of Scope (v1)
- Multi-user / multi-tenancy.
- Cloud hosting or remote access.
- Live brokerage API integrations or real-time quotes.
- Automated trading or order execution.
- Mobile apps.
- Complex tax reporting or advanced tax lot accounting (FIFO/LIFO beyond basics).

## 3. Functional Requirements (User Features)

### 3.1 Multi-Account Dashboard
- Add/edit/delete trading accounts.
- Consolidated portfolio summary:
  - Total portfolio value.
  - Total realized/unrealized P/L (absolute and %).
  - Asset allocation (by ticker, sector if tagged).
  - Number of holdings and accounts.
- **Upcoming Exits** panel with visual warnings (color-coded: approaching, hit target, overdue).
- Quick links to add new transaction or generate AI prompt.

### 3.2 Stock Inventory Management
- Full CRUD for transactions/holdings:
  - Fields: Ticker, Quantity, Buy Price, Buy Date, Trading Account, Notes.
- Support average cost basis per ticker per account (simple aggregation).
- Bulk CSV import for transactions.
- View holdings with current manually-updated price (for P/L calculation).

### 3.3 Strategy & Exit Tracker (Critical Feature)
- When adding/editing a purchase, optionally attach an **Exit Plan**:
  - Target Exit Price.
  - Target Exit Date.
  - Rationale / Notes (rich text or markdown).
- Dashboard alerts:
  - Price-based (when current price ≥ target).
  - Date-based (7 days before, on date, overdue).
- **Closed Positions** log:
  - Mark a position as closed (record actual exit price/date).
  - Side-by-side comparison: Planned vs Actual (P/L delta, adherence score).

### 3.4 AI Prompt Generator Engine
- Dedicated workspace page.
- Aggregates:
  - Current holdings (ticker, avg buy price, quantity, current value, unrealized P/L).
  - Active Exit Plans.
  - Closed positions summary.
  - Overall portfolio stats.
- One-click "Generate AI Prompt" that produces a well-structured, comprehensive prompt including:
  - Portfolio snapshot.
  - Open positions with exit plans.
  - Risk observations.
  - Instructions for the LLM (e.g., "Provide balanced review, suggest rebalancing, flag any thesis drift").
- Copy button + option to customize the prompt before copying.

### 3.5 Additional Features
- Transaction history and individual stock detail views.
- Simple charts (portfolio value over time, allocation pie).
- Full database export/import and manual backup reminders.

## 4. Non-Functional Requirements

- **Performance:** Sub-second page loads and data operations (local SQLite).
- **Data Persistence:** Use SQLite with proper transaction handling for safe concurrent reads/writes (though single-user).
- **Portability:** Database file stored in a user-friendly location (e.g., `~/Library/Application Support/StockTracker/db.sqlite`). Easy one-click backup/restore.
- **Reliability:** Graceful error handling, data validation, and audit-friendly timestamps.
- **Usability:** Clean, modern UI optimized for desktop. Dark mode support recommended.
- **Maintainability:** Modular NestJS backend with clear separation of concerns. Well-documented API.

## 5. Data Model / Schema Design

**Relational Schema (PostgreSQL/SQLite compatible)**

### Accounts
- `id` (PK, UUID or integer)
- `name` (e.g., "Zerodha", "Interactive Brokers")
- `description`
- `created_at`, `updated_at`

### Transactions (Holdings)
- `id` (PK)
- `account_id` (FK)
- `ticker` (string, uppercase)
- `quantity` (decimal)
- `buy_price` (decimal)
- `buy_date` (date)
- `notes`
- `created_at`, `updated_at`

### ExitPlans
- `id` (PK)
- `transaction_id` (FK, unique for 1:1)
- `target_exit_price` (decimal)
- `target_exit_date` (date)
- `rationale` (text)
- `created_at`, `updated_at`

### ClosedPositions (or status on Transaction)
- `id`
- `transaction_id` (FK)
- `actual_exit_price`
- `actual_exit_date`
- `closed_at`

**Additional Supporting Tables/Views**
- Optional: `PriceHistory` for manual price snapshots.
- Database views or backend services for portfolio aggregation.

**Recommended ORM:** Prisma (excellent SQLite + TypeScript support) or TypeORM.

## 6. Key Wireframes / UI Layout Ideas

### Main Consolidated Dashboard
- Top navbar: Logo, Navigation (Dashboard, Holdings, Closed, AI Insights, Settings), Add Transaction button.
- Hero summary cards (Total Value, P/L Today, Allocation %).
- Two-column layout:
  - Left: Holdings table (sortable by P/L, target date).
  - Right: Upcoming Exits + Quick AI Prompt button.
- Color-coded alerts (green/yellow/red).

### Stock Entry Form
- Modal or dedicated page.
- Basic fields (Ticker, Qty, Price, Date, Account).
- Collapsible **Exit Strategy** section (prominently highlighted).
- Form validation + preview of projected P/L.

### AI Prompt Generation Workspace
- Clean page with:
  - Portfolio summary preview (read-only).
  - Generated prompt in a large textarea.
  - Controls: "Regenerate", "Customize", "Copy to Clipboard".
  - History of previously generated prompts (optional).

### Transaction / Stock Details
- Tabs: Overview, Exit Plan, History, Performance.

