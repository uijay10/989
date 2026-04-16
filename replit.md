# Web3Hub

A Web3 project demand publishing and matching platform. One-stop platform connecting Web3 project teams, KOLs, and developers.

## Architecture

- **Monorepo**: pnpm workspaces
- **Frontend**: React 19 + Vite + Tailwind CSS 4 (port 5000 in dev)
- **Backend**: Express 5 + Node.js (port 8080 in dev)
- **Database**: PostgreSQL + Drizzle ORM
- **Web3**: Wagmi + WalletConnect v2 (@web3modal/wagmi)
- **State**: TanStack React Query v5
- **Routing**: Wouter
- **Validation**: Zod

## Project Structure

```
artifacts/
  api-server/    # Express API backend
  web3hub/       # React + Vite frontend
lib/
  api-spec/      # OpenAPI spec + Orval codegen
  api-client-react/  # Generated React Query hooks
  api-zod/       # Generated Zod schemas
  db/            # Drizzle ORM schema + DB connection
scripts/
```

## Development

Two workflows run simultaneously:
- **Start application**: Frontend on port 5000 (`PORT=5000 BASE_PATH=/ pnpm --filter @workspace/web3hub run dev`)
- **Backend API**: API server on port 8080 (`PORT=8080 pnpm --filter @workspace/api-server run dev`)

Frontend proxies `/api` requests to `http://localhost:8080`.

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string (auto-provisioned by Replit)
- `PORT` - Set to 5000 for frontend, 8080 for backend
- `BASE_PATH` - Set to `/` for frontend
- `API_PORT` - Backend port (8080)

## Database

Schema is managed with Drizzle ORM. To push schema changes:
```bash
pnpm --filter @workspace/db run push
```

## AI Scraping System (v2.0_migrated_2026)

### Architecture
- **Instances**: 11 Groq keys (free, round-robin) + 1 DeepSeek key (paid, budget-controlled)
- **Keywords**: All existing keywords combined into a single unified pool — no plate-specific routing
- **Classification**: AI classifies each article into one or more sections
- **Dual-publish**: Every article is published to its matched section(s) AND always also to 7×24快讯 (724news)
- **Fallback**: Articles that are clearly Web3 but don't match any specific section → published to 724news only
- **Non-Web3**: Rejected entirely (not published anywhere)

### Schedule
- **Groq cycle**: Every 30 minutes — `freeOnly=true`, max 100 articles/run
- **DeepSeek cycle**: Every 60 minutes — `paidOnly=true`, max 50 articles/run
- **DB leader lock**: Only one server instance runs the cron at a time

### Budget Control
- **DeepSeek daily cap**: $0.50/day (persisted in DB `ai_cost_daily`, resets at UTC midnight)
- **DeepSeek hourly cap**: $0.50/24 = ~$0.020833/hour (in-memory, resets each UTC clock-hour)
- **Groq**: Free tier, 11 keys × 1000 req/day = 11000/day. At 48 runs/day each run uses ~4 calls per key → well within limits

### Key Files
- `artifacts/api-server/src/lib/auto-scraper.ts` — v2.0 unified scraper (`runUnifiedScrape`)
- `artifacts/api-server/src/lib/ai-provider.ts` — provider routing, Groq rotation, DeepSeek daily+hourly budget
- `artifacts/api-server/src/app.ts` — cron scheduler (Groq 30min + DeepSeek 60min)
- `artifacts/api-server/src/routes/auto-scrape.ts` — admin HTTP API

## Key Features

- 15 navigation sections (Testnet, IDO, Security, etc.)
- Multilingual support (12 languages)
- Wallet-based authentication (MetaMask, OKX, WalletConnect)
- Energy/Points system for users
- Admin panel for managing users and applications
- Twitter-style timelines (Showcase, KOL, Developer, Community pages)
