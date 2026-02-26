# Project Knox

A civic engagement platform where U.S. citizens can vote on bills and policies being considered by their federal and state representatives, discover who their reps are, contact them directly, and see real-time community opinion polling.

## Features

- **Bill Feed** — Personalized feed of bills from your representatives in Congress and your state legislature
- **Opinion Voting** — Vote Support / Oppose / Neutral on any bill (one vote per user)
- **Community Polling** — See real-time national, state, and district breakdowns
- **Representative Discovery** — Find your federal senators, House rep, and state legislators by address
- **Contact Your Reps** — Pre-filled message templates and direct links to official contact forms
- **Notifications** — Get alerted when new bills come up or bill status changes (Phase 2)

## Architecture

**Monorepo** (Turborepo):
- `apps/web` — Next.js 15 web app (SSR/SEO)
- `apps/api` — Express API server (mobile + shared backend)
- `apps/mobile` — Expo React Native app (iOS + Android)
- `packages/types` — Shared TypeScript types
- `packages/config` — Shared ESLint + TypeScript configs

**External APIs** (all free for MVP):
- [Congress.gov API](https://api.congress.gov/) — Federal bills and members (free, 5,000 req/hr)
- [OpenStates API v3](https://docs.openstates.org/api-v3/) — State bills and legislators (free, 500 req/day)
- [US Census Geocoding API](https://geocoding.geo.census.gov/geocoder/) — Address → district matching (free, no key)
- [Wikidata SPARQL API](https://query.wikidata.org/) — Local officials (free, community data)

**Optional paid integrations:**
- [Cicero API](https://www.cicerodata.com/) — Comprehensive local official lookup (~$298/yr for nonprofits). Enable by setting `CICERO_API_KEY`.

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL (or [Supabase](https://supabase.com/) cloud)
- Redis (or [Upstash](https://upstash.com/) serverless)

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/labtopnerd/Project-Knox.git
cd Project-Knox

# 2. Install dependencies
npm install

# 3. Copy env example and fill in your values
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local

# 4. Set up the database
npm run db:push       # Push schema to DB
npm run db:seed       # Seed with sample data

# 5. Start development servers
npm run dev
```

### Environment Variables

See [`.env.example`](.env.example) for all required variables.

**Required for MVP:**
- `DATABASE_URL` — PostgreSQL connection string
- `CONGRESS_API_KEY` — Free from [api.congress.gov/sign-up](https://api.congress.gov/sign-up/)
- `OPENSTATES_API_KEY` — Free from [open.pluralpolicy.com](https://open.pluralpolicy.com/)
- `AUTH_SECRET` — Random secret for NextAuth.js (generate with `openssl rand -base64 32`)

**Optional:**
- `CICERO_API_KEY` — Enables local official lookup (paid, ~$298/yr for nonprofits)
- `REDIS_URL` — Redis for caching (falls back to no-cache if not set)
- `RESEND_API_KEY` — For email notifications (free up to 3,000/month)

### Getting API Keys

| API | URL | Cost |
|-----|-----|------|
| Congress.gov | https://api.congress.gov/sign-up/ | Free |
| OpenStates | https://open.pluralpolicy.com/ | Free |
| Upstash Redis | https://upstash.com/ | Free tier |
| Resend Email | https://resend.com/ | Free tier (3k/month) |
| Cicero (local officials) | https://www.cicerodata.com/free-trial/ | Free trial, then $298/yr |

## Development

```bash
npm run dev          # Start all apps in parallel
npm run build        # Build all apps
npm run type-check   # Type check all packages
npm run lint         # Lint all packages
npm run db:studio    # Open Prisma Studio (DB GUI)
npm run sync:bills   # Manually trigger bill sync
```

## Deployment

- **Web app**: Deploy `apps/web` to [Vercel](https://vercel.com/)
- **API server**: Deploy `apps/api` to [Railway](https://railway.app/) or [Render](https://render.com/)
- **Database**: [Supabase](https://supabase.com/) (managed PostgreSQL)
- **Redis**: [Upstash](https://upstash.com/) (serverless, Vercel-compatible)
- **Mobile**: Submit `apps/mobile` via [Expo EAS Build](https://expo.dev/eas)

## Local Government Coverage

The MVP covers federal and state legislation. Local government (city/county) integration is planned for Phase 3:

| Source | Coverage | Cost |
|--------|----------|------|
| Wikidata SPARQL | Major US cities (community data) | Free |
| Resistbot contact-officials | Growing coverage, form configs | Free (open-source) |
| Cicero API | Comprehensive (federal + state + local) | $298/yr nonprofit |

To add local official lookup for your city, either set `CICERO_API_KEY` or contribute data to [Resistbot's GitHub repo](https://github.com/resistbot/contact-officials).

## Contributing

This is an open-source civic tool. Contributions welcome!

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes
4. Push and open a PR

## License

MIT — see [LICENSE](LICENSE) for details.
