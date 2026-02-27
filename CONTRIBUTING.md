# Contributing to Project Knox

Thank you for helping make civic engagement more accessible. This guide covers everything you need to get Project Knox running locally and submit contributions.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [API Keys](#api-keys)
- [Running Tests & CI](#running-tests--ci)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Code Style](#code-style)

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 20.x |
| npm | 10.x |
| PostgreSQL | 15.x |
| Git | 2.x |

Optional (for mobile development):
- Expo CLI: `npm install -g expo-cli eas-cli`
- iOS Simulator (macOS only) or Android Studio

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/labtopnerd/Project-Knox.git
cd Project-Knox
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/project_knox"
AUTH_SECRET="run: openssl rand -base64 32"
JWT_SECRET="run: openssl rand -base64 32"
CONGRESS_API_KEY=""        # https://api.congress.gov/sign-up/
OPENSTATES_API_KEY=""      # https://open.pluralpolicy.com/
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

The app runs without `RESEND_API_KEY` (emails log to console) and without `REDIS_URL` (caching is skipped).

### 3. Set up the database

```bash
# Create the database
createdb project_knox

# Push the Prisma schema
npm run db:push

# (Optional) Seed demo data
npm run db:seed
```

### 4. Start development servers

```bash
npm run dev
```

This starts all three apps in parallel via Turborepo:

| App | URL |
|-----|-----|
| Web (Next.js) | http://localhost:3000 |
| API (Express) | http://localhost:3001 |
| Mobile (Expo) | http://localhost:8081 |

---

## Project Structure

```
Project-Knox/
├── apps/
│   ├── web/          # Next.js 15 web app (src/app, src/components)
│   ├── api/          # Express API server (src/routes, src/services, src/jobs)
│   └── mobile/       # Expo React Native app (app/, store/, lib/)
├── packages/
│   ├── types/        # Shared TypeScript interfaces
│   └── config/       # Shared tsconfig and ESLint config
├── .github/
│   └── workflows/    # GitHub Actions CI
└── .env.example
```

Key directories in `apps/api/src/`:

| Directory | Purpose |
|-----------|---------|
| `routes/` | Express route handlers (bills, reps, votes, users, contact, sync) |
| `services/` | External API clients (Congress.gov, OpenStates, Census, Resend) |
| `jobs/` | Cron jobs (bill sync every 6h, notifications after sync) |
| `middleware/` | Auth (JWT verify), rate limiting |
| `lib/` | Prisma singleton, Redis client with no-op fallback |

---

## Development Workflow

### Running individual apps

```bash
# Web only
cd apps/web && npm run dev

# API only
cd apps/api && npm run dev

# Mobile only
cd apps/mobile && npm run dev
```

### Database changes

After editing `apps/api/prisma/schema.prisma`:

```bash
# In development — push schema without a migration file
npm run db:push

# In production — create a tracked migration
cd apps/api && npx prisma migrate dev --name describe-your-change
```

### Manually triggering the bill sync

```bash
npm run sync:bills
```

Or via the admin dashboard at `/admin` (requires `ADMIN_EMAILS` env var).

---

## API Keys

All external APIs used by Project Knox are **free**:

| Service | Sign-up URL | Required for |
|---------|------------|-------------|
| Congress.gov | https://api.congress.gov/sign-up/ | Federal bills + members |
| OpenStates | https://open.pluralpolicy.com/ | State bills + legislators |
| Resend | https://resend.com/ | Email notifications (optional) |
| Google OAuth | https://console.cloud.google.com/ | Google sign-in (optional) |
| GitHub OAuth | https://github.com/settings/developers | GitHub sign-in (optional) |

The US Census Geocoding API (address → district lookup) requires no key.

---

## Running Tests & CI

The CI pipeline runs on every push and pull request:

```bash
npm run type-check   # TypeScript across all packages
npm run lint         # ESLint across all packages
cd apps/api && npx prisma validate   # Schema validation
```

---

## Submitting a Pull Request

1. **Fork** the repo and create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes.** Keep each PR focused — one feature or fix per PR.

3. **Ensure CI passes** locally before pushing:
   ```bash
   npm run type-check && npm run lint
   ```

4. **Open a PR** against `main` with a clear title and description explaining:
   - What the change does
   - Why it's needed
   - Any schema migrations required

5. PRs that add Prisma schema changes must include the migration file (`prisma migrate dev`).

### Commit message style

Use conventional commits:

```
feat: add bill bookmarking
fix: prevent duplicate vote aggregate on re-vote
chore: update OpenStates API client for v3 schema change
docs: add API key setup instructions
```

---

## Code Style

- **TypeScript** everywhere — no `any` unless absolutely unavoidable
- **No default exports** for components (named exports preferred)
- **Prisma** for all DB access — no raw SQL
- **Zod** for request body validation in API routes
- Tailwind CSS utility classes in web; `StyleSheet.create` in mobile
- Keep components small and focused; extract shared logic to `lib/` or `services/`

---

## Need Help?

Open an issue at https://github.com/labtopnerd/Project-Knox/issues and tag it `question` or `help wanted`.
