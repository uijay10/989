## Local development

### Option A: Docker

Create a `.env` from `.env.example`, then:

```bash
docker compose up --build
```

### Option B: Node + pnpm

Install Node.js 20+, then:

```bash
npm i -g pnpm
pnpm -r install
PORT=8080 pnpm --filter @workspace/api-server run dev
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/web3hub run dev
```

