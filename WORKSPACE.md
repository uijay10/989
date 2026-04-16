# Web3Hub Workspace

## Overview

Web3Hub – A Web3 project demand publishing and matching platform. One-stop platform connecting Web3 project teams, KOLs, and developers.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS
- **Routing**: Wouter
- **State**: TanStack React Query
- **Web3**: Wagmi + WalletConnect v2 (@web3modal/wagmi)
- **Forms**: React Hook Form + Zod

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── web3hub/            # React + Vite frontend (preview path: /)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Web3Hub Features

### Pages
- **/** – Homepage with pinned projects grid + regular projects grid + hot rank sidebar
- **/showcase** – Project Showcase (Twitter-style timeline)
- **/kol** – KOL Zone (leaderboard + timeline, gold/purple borders)
- **/developer** – Developer Column (timeline, green borders)
- **/community** – Community Chat (timeline with KOL/project tags)
- **/profile** – Full 10-section user dashboard (space status, check-in, points, energy, X link, website, wallet, invite code+invited list, post button, my posts w/ delete+pin); Admin view: avatar + post btn + admin panel link
- **/apply** – Apply for Space form (KOL / Project / Developer) — article template + X post link
- **/project/:id** – Project detail page
- **/section/:slug** – Section page (15 sections, i18n labels/descriptions)
- **/admin** – Admin Panel (applications, users, points & energy management)

### Nav Structure (9+9)
- Row 1: Testnet, IDO/Launchpad, Security, Integration, Airdrop, Events, Funding, Jobs, Nodes
- Row 2: Showcase, Ecosystem, Partners, Hackathon, AMA, Bug Bounty, Community, KOL Collab, Developer

### Key UI Elements
- Sticky top navbar with 9+9 navigation section links (2 rows)
- Pink buttons (#FF69B4), green neon countdown (#00FF9F) for pinned items
- Connect Wallet button (MetaMask, OKX, WalletConnect via @web3modal, projectId: b56e18a13c9a1b59cf6f6ee2765e3591)
- After wallet connect: click-toggle dropdown with solid background, "个人仪表盘" + "退出登录" + Admin Panel for admins
- Full i18n: 12 languages including dashboard/logout/section keys

### Admin System
- 15 admin wallets defined in `artifacts/web3hub/src/lib/admin.ts` (all lowercase)
- Also duplicated in `artifacts/api-server/src/routes/admin.ts`
- Constants: ADMIN_ENERGY = ADMIN_POINTS = 99999999999999, ADMIN_PIN_COUNT = 99999999
- Admin wallets show ∞ for points/energy/pinCount in profile dashboard
- Admin wallets see "Admin Panel" in dropdown (shield icon) + amber badge in dashboard
- `/admin` routes: list users, list/approve/reject/batch applications, edit per-user energy/points/pinCount/ban, bulk all-users points ops, CSV export

### Database Tables
- `users` – wallet, points, energy, space status, invite code, is_banned, pin_count, website, spaceRejectedAt, invitedBy
- `projects` – name, logo, owner wallet, pinned status, status
- `posts` – title, content, section, author info, likes, comments
- `space_applications` – wallet, type (kol/project/developer), links, status

### Energy System
- All 3 types (team/KOL/developer): 1000 energy on approval, 10 posts/day max
- Team (project): also receives 10 pin slots on approval; each pin lasts 3 days (72h)
- KOL/Developer: 0 pin slots on approval
- Check-in and points sections hidden for team and developer (KOL only)

### Payment (Energy Recharge)
- 150 USDT = 10 energy
- 200 USDT = 100 energy
- 300 USDT = 9,999,999 energy
- EVM address: 0xbe4548c1458be01838f1faafd69d335f0567399a
