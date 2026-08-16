# Shopify to MedusaJS Product Synchronization Platform

A complete, production-ready e-commerce solution featuring a **Medusa v2 Backend Engine**, a **Next.js 15 Storefront**, and a standalone **Shopify-to-Medusa Synchronization Engine** built with TypeScript and Shopify Admin GraphQL API.

---

## 🏗️ System Architecture

```
                               ┌───────────────────────────┐
                               │  Shopify Admin GraphQL    │
                               └─────────────┬─────────────┘
                                             │ (Fetch Products)
                                             ▼
                               ┌───────────────────────────┐
                               │    shopify-medusa-sync    │
                               │   (Sync Engine CLI/Cron)  │
                               └─────────────┬─────────────┘
                                             │ (Authenticated REST/SDK)
                                             ▼
┌───────────────────────────┐  ┌───────────────────────────┐
│     Next.js Storefront    │ ◄┼─ Medusa v2 Backend Engine │
│    (http://localhost:8000)│  │   (http://localhost:9000) │
└───────────────────────────┘  └─────────────┬─────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │    PostgreSQL Database    │
                               └───────────────────────────┘
```

---

## 📋 Prerequisites

Before running the project locally, ensure you have:
- **Node.js**: `>= 18.0.0`
- **PNPM**: `>= 9.0.0` (`npm i -g pnpm`)
- **PostgreSQL**: Installed and running locally or remotely
- **Shopify Admin API Token**: Custom App created in Shopify (`Settings > Apps > Develop apps`) with `read_products` access scope.

---

## 🗄️ 1. Database Setup

1. Start your PostgreSQL service.
2. Create a new database named `medusa_my_medusa_store`:

```sql
CREATE DATABASE medusa_my_medusa_store;
```

---

## 🚀 2. Local Setup: Medusa Storefront & Backend

### Step A: Install Dependencies
From the project root (`Shopify-to-Medusa product sync project`):

```bash
cd my-medusa-store
pnpm install
```

### Step B: Configure Environment Variables

**Backend Environment (`my-medusa-store/apps/backend/.env`)**:
```env
DATABASE_URL=postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/medusa_my_medusa_store
JWT_SECRET=supersecret
COOKIE_SECRET=supersecret
```

**Storefront Environment (`my-medusa-store/apps/storefront/.env.local`)**:
```env
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_9b5318586d6438edce79affc2f29acc83b798c8a9460b8246762d92874eda0ac
NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_DEFAULT_REGION=dk
NEXT_PUBLIC_BASE_URL=http://localhost:8000
```

### Step C: Database Migration & Admin Creation
Run database migrations and create the initial admin user:

```bash
cd apps/backend
npx medusa db:migrate
npx medusa exec ./src/scripts/create-admin.ts
npx medusa exec ./src/scripts/seed.ts
```

*Admin Credentials created:*
- **URL**: `http://localhost:9000/app`
- **Email**: `admin@medusajs.com`
- **Password**: `supersecretpassword`

### Step D: Run Backend & Storefront Development Servers
In the `my-medusa-store` directory, start both servers:

```bash
# Terminal 1: Medusa Backend Server (:9000)
pnpm backend:dev

# Terminal 2: Next.js Storefront Server (:8000)
pnpm dev
```

---

## 🔄 3. Shopify to Medusa Synchronization Engine

The sync engine lives in `shopify-medusa-sync/shopify-medusa-sync`.

### Step A: Configure Sync Environment Variables
Copy `.env.example` to `.env` inside `shopify-medusa-sync/shopify-medusa-sync/.env`:

```env
# Shopify Credentials
SHOPIFY_STORE_DOMAIN=your-store-name.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpua_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_VERSION=2026-07

# Medusa Backend Credentials
MEDUSA_BACKEND_URL=http://localhost:9000
MEDUSA_ADMIN_EMAIL=admin@medusajs.com
MEDUSA_ADMIN_PASSWORD=supersecretpassword

# Target Medusa Sales Channel ID (matches Storefront API Key)
MEDUSA_SALES_CHANNEL_ID=sc_01M0524CXV6RAZFPSSZ1VGS97G

# Default Currency Code
DEFAULT_CURRENCY_CODE=usd
```

### Step B: Build & Run Sync Commands

Navigate to the sync engine directory:
```bash
cd shopify-medusa-sync/shopify-medusa-sync
npm install
npm run build
```

Available Sync Commands:

| Command | Description |
| :--- | :--- |
| **`npm run sync`** | **Incremental Sync**: Only syncs products updated in Shopify since the last execution run (timestamp saved in `sync-state.json`). |
| **`npm run sync:full`** | **Full Catalog Sync**: Bypasses timestamp filters and re-evaluates all Shopify products. |
| **`npm run sync:dry-run`** | **Simulation Run**: Logs mapped product payloads without executing writes to Medusa. |

---

## 🤖 4. Automated Syncing with GitHub Actions

Yes! You can automate product synchronization using **GitHub Actions**. By scheduling a workflow with `cron`, GitHub Actions will automatically execute `npm run sync` on your specified schedule (e.g., every 6 hours) without needing a dedicated server.

### Example GitHub Actions Workflow (`.github/workflows/sync.yml`)

```yaml
name: Shopify to Medusa Product Sync

on:
  schedule:
    # Runs every 6 hours
    - cron: '0 */6 * * *'
  workflow_dispatch: # Allows manual trigger from GitHub UI

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Sync Dependencies
        run: |
          cd shopify-medusa-sync/shopify-medusa-sync
          npm ci

      - name: Build & Run Sync Engine
        env:
          SHOPIFY_STORE_DOMAIN: ${{ secrets.SHOPIFY_STORE_DOMAIN }}
          SHOPIFY_ADMIN_ACCESS_TOKEN: ${{ secrets.SHOPIFY_ADMIN_ACCESS_TOKEN }}
          MEDUSA_BACKEND_URL: ${{ secrets.MEDUSA_BACKEND_URL }}
          MEDUSA_ADMIN_EMAIL: ${{ secrets.MEDUSA_ADMIN_EMAIL }}
          MEDUSA_ADMIN_PASSWORD: ${{ secrets.MEDUSA_ADMIN_PASSWORD }}
          MEDUSA_SALES_CHANNEL_ID: ${{ secrets.MEDUSA_SALES_CHANNEL_ID }}
        run: |
          cd shopify-medusa-sync/shopify-medusa-sync
          npm run build
          npm run sync

      - name: Commit Updated Sync Timestamp State
        run: |
          git config --global user.name 'github-actions[bot]'
          git config --global user.email 'github-actions[bot]@users.noreply.github.com'
          git add shopify-medusa-sync/shopify-medusa-sync/sync-state.json
          git diff --quiet && git diff --staged --quiet || (git commit -m "chore: update sync state timestamp" && git push)
```

---

## 🛠️ Tech Stack & Key Features

- **MedusaJS v2**: Core headless commerce platform with custom workflows and modular architecture.
- **Next.js 15 App Router**: High-performance ecommerce storefront.
- **Shopify GraphQL API**: High-efficiency product, variant, image, price, and collection extraction.
- **Idempotent Upserts**: Products are stamped with Shopify's GraphQL ID (`external_id`), preventing duplicates across repeated sync runs.
