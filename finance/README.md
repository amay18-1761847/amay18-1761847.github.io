# Ledgerly: personal finance

Ledgerly is a personal finance app that runs in your browser and keeps all data on your device. It is modeled on the Monarch Money feature set. It is a static site with no build step, no dependencies and no server, and it is served from `/finance/` on GitHub Pages.

**Open it:** `https://amay18-1761847.github.io/finance/` (after this branch is merged into the Pages branch). To run it locally: `python3 -m http.server` in the repo root, then open `http://localhost:8000/finance/`. It uses ES modules, so opening `index.html` directly from `file://` will not work.

## Features

| Area | What it does |
|---|---|
| **Dashboard** | Net worth with a 1M to All chart, this month's cash flow and savings rate, budget watch list, spending donut, upcoming bills, goals and investments |
| **Accounts** | Cash, credit cards, investments, real estate, vehicles and loans. Cash and credit balances rebuild themselves from transactions, anchored to the balances you enter. Other accounts build history from balance updates. You can close an account, exclude it from net worth, and see a per-account balance chart |
| **Transactions** | Search (text or amount), filters (date, account, category, tag, type, review status, hidden), sort, bulk edit (category, tag, reviewed, hide, delete), split transactions, notes, tags, review queue, CSV export |
| **CSV import** | Auto-detects columns for bank, Mint and Monarch exports. Handles an amount column, separate debit/credit columns, or a type column. Supports sign flip, MDY/DMY dates and duplicate detection. Can create accounts from an Account column and map category names from the file |
| **Auto-categorization** | Rules first, then the category you used before for that merchant, then a keyword dictionary. Merchant names are cleaned up (e.g. `SQ *BLUE BOTTLE COFFEE SAN FRANCISCO CA` becomes `Blue Bottle Coffee`) |
| **Rules** | Match on merchant or statement text (contains, equals, starts with), amount, direction and account. Actions: set category, rename, add tags, hide, mark reviewed. Live match preview, optional retroactive apply, priority order. After you recategorize a transaction, the app offers to apply the change to the same merchant's other transactions and create a rule |
| **Cash flow** | Monthly income vs. spending, Sankey diagram (income → spending groups → saved), breakdown by group, category or merchant with drill-down |
| **Reports** | Spending or income by category, group, merchant, account or tag over any range. Trend line, donut, month-by-month table with sparklines, CSV export |
| **Budget** | Category budgets that carry forward, rollover per category (start month and starting balance), pace marker for the month so far, "left to budget", fill from 3- or 12-month averages, copy last month. **Flex budgeting** mode: fixed, one flexible pool, and non-monthly |
| **Recurring** | Detects subscriptions, bills and paychecks from history (weekly to yearly). Confirm or dismiss suggestions. Calendar with paid/missed status and monthly totals |
| **Goals** | Linked to an account balance or tracked with manual contributions. Shows monthly amount needed, on-track status and projected completion date |
| **Investments** | Holdings with shares, price and cost basis; allocation by asset class; gain/loss; bulk price update; sync the account balance to the holdings value |
| **Settings** | Currency, theme (light/dark/system), categories and groups (add, edit, delete with reassignment), tags, JSON backup and restore, sample data, reset |

## Differences from Monarch

- **No automatic bank sync.** Monarch uses paid aggregators (Plaid, MX, Finicity) that need a backend and signed contracts. Here you import CSVs or enter transactions by hand.
- **No live market prices.** You enter prices manually; "Update prices" updates each ticker once.
- **Single device.** Data is in `localStorage` (about 5 MB, roughly 15,000 transactions). Use Settings → Data & backup to move it to another device or keep a copy. Clearing site data deletes everything.
- No household sharing, AI assistant or mobile apps.

## Code layout

```
finance/
  index.html          app shell + sidebar
  css/app.css         design tokens (light/dark), layout, components
  js/app.js           hash router, theme, first-run welcome
  js/store.js         state, persistence, export/import
  js/engine.js        pure finance logic: merchant cleanup, rules, categorization,
                      balances/net worth, budgets/rollover/flex, recurring detection, goals
  js/charts.js        dependency-free SVG charts (line, columns, donut, sankey, sparkline)
  js/csv.js           CSV parser + header detection
  js/demo.js          deterministic sample-data generator
  js/views/*.js       one module per screen + shared editors
```

Sign convention: money out is negative, money in is positive. Liability balances are stored as positive amounts owed. Transfers and credit-card payments are excluded from income, spending and budgets.
