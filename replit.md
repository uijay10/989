# Web3 Release

A Web3 intelligent information matching platform that connects project teams, KOLs, and developers for funding rounds, job seeking, bug bounties, community building, and collaborations.

## Run & Operate

- **Frontend dev**: `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/web3hub run dev`
- **Backend dev**: `PORT=8080 pnpm --filter @workspace/api-server run dev`
- **Install deps**: `pnpm install` (from repo root)
- **DB schema push**: `cd lib/db && DATABASE_URL=... pnpm drizzle-kit push` (interactive; prefer direct SQL for CI)
- **Required env vars**: `DATABASE_URL` (auto-provisioned by Replit PostgreSQL)
- **Optional secrets**: `GROQ_API_KEY` / `GROQ1`–`GROQ50`, `DEEPSEEK_API_KEY`, `RESEND_API_KEY`, `ADMIN_TOKEN_SECRET`

## Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS v4, TanStack Query v5, Wouter, Wagmi/Viem (Web3Modal)
- **Backend**: Express v5, TypeScript, tsx (dev runner)
- **Database**: PostgreSQL 16 (Replit built-in), Drizzle ORM v0.45
- **API layer**: OpenAPI spec → Orval codegen → `@workspace/api-client-react` (React Query hooks)
- **AI/scraping**: Groq (free), DeepSeek (paid), OpenAI-compatible SDK; rss-parser + cheerio
- **Runtime**: Node.js 20, pnpm workspaces monorepo

## Where things live

- `artifacts/api-server/src/` — Express app, routes, cron jobs, AI scraping
- `artifacts/web3hub/src/` — React frontend pages and components
- `lib/db/src/schema/` — Drizzle ORM schema (source of truth)
- `lib/api-spec/` — OpenAPI spec (source of truth for API contracts)
- `lib/api-client-react/` — Generated React Query hooks (do not edit by hand)

## Architecture decisions

- **Web3 wallet auth only** — no traditional auth; users sign in via MetaMask/WalletConnect; admin uses HMAC-signed challenge tokens
- **Monorepo with pnpm workspaces** — shared `@workspace/db`, `@workspace/api-zod`, `@workspace/api-client-react`
- **AI content scraping** — cron jobs pull RSS/web content, classify via Groq/DeepSeek, publish as AI posts; all keys are optional (scraping is skipped if no keys)
- **DB leader lease** — `cron_leader` table prevents duplicate cron runs across multiple replicas
- **Tables created at startup** — `ensureTables()` in `app.ts` idempotently creates any tables not covered by schema migrations

## Product

- News feed with sections: 7*24 News, IDO/Launchpad, Funding, VC, Airdrops, DeFi, NFT, Research, Regulation, Testnet, Nodes, Dev Bounty, Grants
- User profiles with wallet-based identity, points, energy, invite codes
- Space applications for projects/KOLs to get a dedicated space
- Admin panel with wallet-signed authentication
- AI-powered article scraping and classification

## User preferences

- Keep existing code structure; do not rewrite from scratch

## Gotchas

- `pnpm install` must run before any workflow starts (node_modules not committed)
- The `preinstall` script blocks npm/yarn; always use pnpm
- `drizzle-kit push` is interactive; use direct SQL or `--force` for CI
- Tables are also created at server startup via `ensureTables()` as a safety net
- Vite requires `PORT` and `BASE_PATH` env vars at dev time (throws if missing)

## Pointers

- DB schema: `lib/db/src/schema/`
- API routes: `artifacts/api-server/src/routes/`
- Vite config: `artifacts/web3hub/vite.config.ts`
- Build script: `scripts/build-prod.sh`
