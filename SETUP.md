# CodeRelay — Setup Guide

A no-auth code push/pull service. Create an 8-character endpoint ID, push code (zip/tar.gz), pull anytime, or share one-time flash links. Built with Next.js 16, React 19, TypeScript, Prisma, and the Bun runtime.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Build for Production](#build-for-production)
- [Deployment Options](#deployment-options)
- [Project Structure](#project-structure)
- [CLI Tool](#cli-tool)
- [Troubleshooting](#troubleshooting)

---

## Project Overview

CodeRelay is a lightweight, authentication-free code relay service. Instead of managing user accounts, it issues short 8-character endpoint IDs that you use to **push** code archives (`.zip` or `.tar.gz`) and **pull** them back from anywhere. It also supports one-time **flash links** — 24-character tokens that allow a single download before auto-invalidating — for securely sharing a snapshot with someone else without exposing the endpoint. The last 5 snapshots per project are kept for version history.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Bun** | 1.3+ | Recommended runtime & package manager |
| **Node.js** | 18+ | Alternative if Bun is unavailable |
| **SQLite3** | any | Bundled via Prisma; no separate server needed |
| **Git** | 2.20+ | For cloning the repository |

Install Bun (recommended):

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# verify
bun --version
```

Or install Node.js 18+ from <https://nodejs.org/>.

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/sudaisalamboy/CodeRelay.git
cd CodeRelay
```

### 2. Install dependencies

```bash
bun install
# or, if using npm
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root (a template is provided in `.env.example`):

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL="file:./db/coderelay.db"
NODE_ENV="development"
```

### 4. Initialize the database

Push the Prisma schema to create the SQLite database and tables:

```bash
bun run db:generate   # generate the Prisma client
bun run db:push       # create / sync the schema
```

> The `storage/` directory (where uploaded archives live) is created automatically on first push and is gitignored.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | yes | `file:./db/coderelay.db` | SQLite connection string (file path) |
| `NODE_ENV` | no | `development` | Set to `production` for production builds |

No third-party API keys are required — the service is fully self-contained.

---

## Running Locally

Start the development server:

```bash
bun run dev
```

The app starts on **http://localhost:3000** and live-reloads on file changes. Dev logs are also written to `dev.log`.

Other useful scripts:

```bash
bun run lint       # run ESLint
bun run db:push    # re-sync schema after editing prisma/schema.prisma
bun run db:migrate # create a versioned migration
bun run db:reset   # drop & recreate the database (destructive)
```

---

## Build for Production

CodeRelay is configured with Next.js **standalone output**, which produces a minimal self-contained server bundle.

```bash
# 1. build (also copies .next/static and public/ into the standalone dir)
bun run build

# 2. run the production server
bun run start
```

The standalone server is emitted to `.next/standalone/server.js` and serves the app on the port defined by `PORT` (default `3000`).

---

## Deployment Options

### Option A — Vercel (easiest)

1. Push the repo to GitHub.
2. Import the project at <https://vercel.com/new>.
3. Framework preset: **Next.js**.
4. Add the `DATABASE_URL` environment variable (use a persistent SQLite volume or switch the Prisma provider to PostgreSQL for multi-instance deployments).
5. Build command: `next build` · Output: handled automatically.

> **Note:** Because CodeRelay writes archives to the local filesystem (`storage/`), serverless platforms that reset the filesystem between requests are **not** ideal for the push/pull feature. Prefer a persistent VM / container for full functionality.

### Option B — Self-hosted with Bun

```bash
bun install
bun run db:push
bun run build
bun run start
```

Run behind a reverse proxy (Caddy / nginx) for TLS termination.

### Option C — Caddy reverse proxy (included)

A `Caddyfile` is included that proxies port 81 to the Next.js app:

```bash
caddy run --config Caddyfile
```

Access the app at the configured port (default `:81`). Edit the `Caddyfile` to set your domain and enable automatic HTTPS.

### Option D — Docker

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run db:generate && bun run build
EXPOSE 3000
CMD ["bun", "run", "start"]
```

Bind-mount the `db/` and `storage/` directories to persist data across container restarts.

---

## Project Structure

```
CodeRelay/
├── src/
│   ├── app/
│   │   ├── api/            # REST API routes
│   │   │   ├── projects/   # create / get / delete endpoints
│   │   │   ├── push/       # upload code archive
│   │   │   ├── pull/       # download latest snapshot
│   │   │   ├── flash/      # generate / list one-time tokens
│   │   │   ├── flash-download/  # redeem a flash token
│   │   │   └── history/    # list recent snapshots
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/ui/       # shadcn/ui component library
│   ├── hooks/
│   └── lib/
│       ├── db.ts            # Prisma client singleton
│       ├── storage.ts       # filesystem archive storage
│       ├── id.ts            # 8-char endpoint / 24-char token generators
│       └── utils.ts
├── prisma/schema.prisma     # Project / PushSnapshot / FlashToken models
├── download/coderelay.sh    # CLI tool
├── scripts/                 # backup + security-test helpers
├── storage/                 # (gitignored) uploaded archives
├── Caddyfile
├── next.config.ts
└── package.json
```

---

## CLI Tool

A convenience bash CLI is provided at `download/coderelay.sh`:

```bash
chmod +x download/coderelay.sh
export RELAY_HOST="http://localhost:3000"

./download/coderelay.sh create my-project
./download/coderelay.sh push   gb73h83h ./my-project-folder
./download/coderelay.sh pull   gb73h83h
./download/coderelay.sh flash  gb73h83h
./download/coderelay.sh info   gb73h83h
./download/coderelay.sh delete gb73h83h
```

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `prisma: command not found` | Prisma CLI not installed | Run `bun add -d prisma` or `bunx prisma generate` |
| `Database is locked` | Another process holds the SQLite file | Stop duplicate dev servers; SQLite supports one writer |
| Push returns `400` | Archive not `.zip` or `.tar.gz`, or > size limit | Re-package as a supported format |
| `storage/` not created | Missing write permission in project dir | `mkdir -p storage && chmod 755 storage` |
| Flash link returns `410` | Token already redeemed | Flash tokens are single-use; generate a new one |
| `PORT already in use` | Another process on 3000 | `bun run dev -- -p 3001` or set `PORT=3001` |
| History shows < 5 entries | Old snapshots rotated out | Only last 5 snapshots are retained per project |
| Build fails on `sharp` | Native binding issue on some Linux distros | `bun add sharp` or install `libvips-dev` |

---

Made by **Sudais Alam** · [GitHub @sudaisalamboy](https://github.com/sudaisalamboy)
