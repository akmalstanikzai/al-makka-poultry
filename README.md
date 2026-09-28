# Al-Makka Poultry Feed Factory

React/Vite factory management application backed by Supabase Auth, Postgres,
Row Level Security, and Realtime.

## Environment

Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` plus
`VITE_SUPABASE_PUBLISHABLE_KEY`. The publishable key is safe for the browser;
database access is restricted to authenticated Supabase users by Row Level
Security.

## Database migrations

Migrations are stored in `supabase/migrations` in execution order:

1. `20260928000000_rebuild_public_schema.sql` destructively replaces the old
   public application schema while preserving Supabase Auth accounts.
2. `20260928000001_enable_realtime.sql` adds all application tables to the
   Supabase Realtime publication.

The baseline starts with no suppliers, customers, inventory, formulas, batches,
sales, expenses, or transactions. It creates only two required configuration
rows: zero cash balance and the default 5,000 kg stock warning threshold.

To deploy after authenticating the Supabase CLI:

```sh
supabase link --project-ref lhnayouvcwvapzbxlolu
supabase db push
```

Alternatively, set `SUPABASE_DB_URL` to the direct database connection string
and run `supabase db push --db-url "$SUPABASE_DB_URL"`.

## Development

```sh
npm install
npm run dev
```
