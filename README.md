# CodeRelay

A no-auth code push/pull service. Create an 8-character endpoint ID, push code (zip/tar.gz), pull anytime, or share one-time flash links.

**Repository:** https://github.com/sudaisalamboy/CodeRelay.git

## Preview

<p align="center">
  <img src="preview/preview.png" alt="CodeRelay Preview" width="100%" />
</p>

> 📖 **Full setup instructions:** see [SETUP.md](SETUP.md) for detailed installation, configuration, and deployment guide.

## Features

- **No Authentication**: Simple endpoint-based access control
- **Push & Pull**: Upload code archives (zip or tar.gz), download anytime
- **Flash Links**: Generate one-time 24-character tokens for secure sharing
- **Version History**: Keeps last 5 snapshots per project
- **CLI Tool**: Bash script for command-line operations
- **Modern UI**: Built with Next.js, Tailwind CSS, and shadcn/ui

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS 4, shadcn/ui components
- **Database**: SQLite with Prisma ORM
- **Storage**: File system (configurable via `storage/` directory)
- **Server**: Bun runtime (Node.js compatible)
- **Reverse Proxy**: Caddy (optional, via Caddyfile)

## Installation

### Prerequisites

- Bun (recommended) or Node.js 18+
- SQLite3

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd coderelay
```

2. Install dependencies:
```bash
bun install
# or
npm install
```

3. Set up the database:
```bash
bun run db:push
```

4. Create environment file (`.env`):
```env
DATABASE_URL="file:./db/coderelay.db"
```

## Development

### Start development server

```bash
bun run dev
```

The app will be available at `http://localhost:3000`

### Build for production

```bash
bun run build
```

### Start production server

```bash
bun run start
```

## Usage

### Web UI

1. Open `http://localhost:3000`
2. Create a new endpoint by entering a project name
3. Copy the 8-character endpoint ID
4. Use the CLI or API to push/pull code

### CLI Tool

A convenience bash script is provided at `download/coderelay.sh`.

```bash
# Make executable
chmod +x download/coderelay.sh

# Set host (optional, defaults to localhost:3000)
export RELAY_HOST="http://localhost:3000"

# Create endpoint
./download/coderelay.sh create my-project

# Push code (folder or zip)
./download/coderelay.sh push gb73h83h ./my-project-folder

# Pull code
./download/coderelay.sh pull gb73h83h

# Generate one-time flash link
./download/coderelay.sh flash gb73h83h

# Get project info
./download/coderelay.sh info gb73h83h

# Delete endpoint
./download/coderelay.sh delete gb73h83h
```

### API Reference

#### Create Endpoint
```http
POST /api/projects
Content-Type: application/json

{
  "name": "my-project"
}
```

Response:
```json
{
  "endpointId": "gb73h83h",
  "name": "my-project"
}
```

#### Get Project Metadata
```http
GET /api/projects/:endpointId
```

#### Delete Project
```http
DELETE /api/projects/:endpointId
```

#### Push Code (Upload Archive)
```http
POST /api/push/:endpointId
Content-Type: multipart/form-data

file=@project.zip
```

Supports: `.zip` or `.tar.gz` archives

#### Pull Code (Download Archive)
```http
GET /api/pull/:endpointId
```

Returns: Zip file of latest snapshot

#### Generate Flash Token
```http
POST /api/flash/:endpointId
```

Response:
```json
{
  "token": "abc123xyz789...",
  "url": "/api/flash-download/abc123xyz789..."
}
```

#### List Flash Tokens
```http
GET /api/flash/:endpointId
```

#### Download via Flash Token (One-time)
```http
GET /api/flash-download/:token
```

Invalidates token after successful download

#### Get History
```http
GET /api/history/:endpointId
```

Returns: Last 5 snapshots with metadata

## Project Structure

```
coderelay/
├── src/
│   ├── app/              # Next.js app directory
│   │   ├── api/         # API routes
│   │   ├── layout.tsx   # Root layout
│   │   ├── page.tsx     # Home page
│   │   └── globals.css  # Global styles
│   ├── components/      # React components
│   │   └── ui/          # shadcn/ui components
│   ├── hooks/           # Custom React hooks
│   └── lib/             # Utilities
│       ├── db.ts        # Prisma client
│       ├── storage.ts   # File storage logic
│       └── utils.ts     # Helper functions
├── prisma/
│   └── schema.prisma    # Database schema
├── public/              # Static assets
├── scripts/             # Utility scripts
│   ├── backup_coderelay.sh
│   ├── nikto_batch.py
│   └── targets.txt
├── download/            # Downloads and CLI
│   └── coderelay.sh     # CLI tool
├── storage/             # File storage (gitignored)
├── Caddyfile            # Caddy reverse proxy config
├── package.json
├── tsconfig.json
└── README.md
```

## Database Schema

### Project
- `endpointId`: 8-char unique identifier (used in API)
- `displayName`: Human-readable label
- `pushCount` / `pullCount`: Usage statistics
- `lastPushedAt` / `lastPulledAt`: Timestamps

### PushSnapshot
- Stores last 5 versions per project
- Tracks file count, total bytes, format (zip/tar.gz)

### FlashToken
- 24-char one-time download tokens
- Single-use, auto-invalidates after download

## Deployment

### Using Bun

```bash
bun install
bun run db:push
bun run build
bun run start
```

### Using Caddy (Reverse Proxy)

The included `Caddyfile` proxies port 81 to the Next.js app:

```bash
caddy run --config Caddyfile
```

Access at the configured port (default: 81)

### Environment Variables

- `DATABASE_URL`: SQLite database path (default: `file:./db/coderelay.db`)
- `NODE_ENV`: Set to `production` for production builds

## Scripts

### Backup Script

`scripts/backup_coderelay.sh` creates a clean backup zip excluding:
- `node_modules/`, `.next/`, `storage/`
- Database files, logs, git history

Usage:
```bash
PROJECT_DIR=/path/to/coderelay ./scripts/backup_coderelay.sh
```

### Security Testing

`scripts/nikto_batch.py` - Batch Nikto web vulnerability scanner (for authorized testing only).

See script header for usage instructions.

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a pull request.
