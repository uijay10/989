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

## Key Features

- 15 navigation sections (Testnet, IDO, Security, etc.)
- Multilingual support (12 languages)
- Wallet-based authentication (MetaMask, OKX, WalletConnect)
- Energy/Points system for users
- Admin panel for managing users and applications
- Twitter-style timelines (Showcase, KOL, Developer, Community pages)
