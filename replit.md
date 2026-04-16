# Web3Hub - Web3 Release Platform

## Overview
Web3Hub is a comprehensive Web3 project demand publishing and matching platform. It connects Web3 project teams, KOLs (Key Opinion Leaders), and developers by facilitating request posting and matching for funding rounds, job openings, bug bounties, and community building.

## Architecture
This is a **pnpm monorepo** with two main artifacts and shared libraries:

```
├── artifacts/
│   ├── api-server/     # Express 5 backend API (port 8080)
│   └── web3hub/        # React + Vite frontend (port 5000)
├── lib/
│   ├── api-spec/       # OpenAPI spec + Orval codegen config
│   ├── api-client-react/ # Generated React Query hooks
│   ├── api-zod/        # Generated Zod schemas
│   └── db/             # Drizzle ORM schema + DB connection
```

## Tech Stack
- **Package Manager**: pnpm (workspaces)
- **Frontend**: React 19, Vite 7, Tailwind CSS 4, TanStack React Query, Wouter, Framer Motion
- **Backend**: Express 5, Node.js, tsx (dev), esbuild (prod)
- **Database**: PostgreSQL + Drizzle ORM
- **Web3**: Wagmi, Viem, WalletConnect v2 (@web3modal/wagmi)
- **Validation**: Zod

## Development Workflows
- **Frontend**: `Start application` workflow — `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/web3hub run dev` (port 5000)
- **Backend**: `Backend API` workflow — `PORT=8080 pnpm --filter @workspace/api-server run dev` (port 8080)

Frontend proxies `/api` requests to `http://localhost:8080`.

## Database
Uses Replit's built-in PostgreSQL. Schema is managed via Drizzle ORM.
- Push schema: `cd lib/db && pnpm run push`
- Tables: users, projects, posts, space_applications, comments, notifications

## Key Features
- Energy & Points system for users (Teams, KOLs, Developers)
- Admin system with hardcoded admin wallets
- Application workflow for Space status
- Multi-language support (12 languages)
- Crypto price ticker
- Content feed with 15 sections

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (auto-set by Replit)
- `PORT` - Server port (set per workflow)
- `BASE_PATH` - Frontend base path (set to `/`)
