# Setup

## Prerequisites

- Node 22+, npm
- Docker + `psql` (for `supabase/tests/run.sh`)
- Supabase CLI (`npx supabase ...`), once a project exists

## Database tests (works today)

```bash
supabase/tests/run.sh
```
Docker can take a few minutes to start the container on the dev machine.

## Local Supabase (works today)

```bash
npx supabase@2.120.0 start -x studio,edge-runtime,logflare,vector,supavisor,imgproxy,postgres-meta
```
Ports are moved to **553xx** in `supabase/config.toml` because another project
on the dev machine uses the default 543xx. API `http://127.0.0.1:55321`,
DB `postgresql://postgres:postgres@127.0.0.1:55322/postgres`, mail UI
`http://127.0.0.1:55324`. `npx supabase status` prints the anon key.
Email confirmation is off locally, so sign-up logs straight in.
`npx supabase db reset` re-applies all migrations from scratch.

## Supabase project (not created yet)

1. The user creates a project at supabase.com (region nearest Ghana: EU West or EU Central).
2. Link it and push migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. Auth settings: enable email sign-in; set the site URL to the app's domain.

## Frontend

Vite + React + TS + Tailwind v4 in the repo root.

```bash
npm install
cp .env.example .env.local   # fill in the anon key from `npx supabase status`
npm run dev                  # http://localhost:5173
npm test                     # vitest unit tests
npm run build                # tsc + vite build → dist/
```

Hosting must serve `index.html` for every path (SPA rewrite), because the
public tracking page lives at `/t/<token>`. Staff tabs use `#hash` routing.

Env vars (`.env.local`, never committed):

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

The anon key is public by design (RLS protects the data); never put the
service role key in a `VITE_` variable.

## Secrets (Edge Functions only)

```bash
npx supabase secrets set SMS_PROVIDER=arkesel SMS_API_KEY=... SMS_DEFAULT_SENDER=VELOXA
npx supabase secrets set PAYSTACK_SECRET_KEY=...        # Phase 5
```

## Accounts the user still needs to create

See the "Needed from you" list in [PLAN.md](../PLAN.md).
