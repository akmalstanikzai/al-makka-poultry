# Al-Makka Poultry Feed Factory

React/Vite factory management application backed by Supabase Auth, Postgres,
and Row Level Security. The browser reads from and writes to Supabase directly;
the application does not use a backend synchronization service.

## Environment

Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` plus
`VITE_SUPABASE_PUBLISHABLE_KEY`. The publishable key is safe for the browser;
database access is restricted to authenticated Supabase users by Row Level
Security.

## Database migrations

Migrations are stored in `supabase/migrations` in execution order:

1. `20260928000000_rebuild_public_schema.sql` destructively replaces the old
   public application schema while preserving Supabase Auth accounts.
2. The dated follow-up migrations add the supplier/customer settlement and
   dual-currency columns used by the frontend.
3. `20261010000000_disable_realtime.sql` removes the application tables from
   Realtime because the UI loads once and performs targeted REST writes. Apply
   this migration to existing projects to stop unused replication traffic.
4. `20261015000000_add_auditable_transaction_corrections.sql` adds atomic
   Reverse-and-Replace/Void corrections for customer and supplier history.
   Apply it before using the history correction buttons; it preserves originals
   and updates linked accounts, cash, inventory, and sales in one transaction.
5. `20261015010000_allow_transaction_type_corrections.sql` allows a corrected
   replacement to use another valid transaction type on the same account.
6. `20261017000000_fix_same_item_raw_stock_corrections.sql` reapplies the
   corrected account-history RPC so editing an incoming raw-material transaction
   adjusts stock by the net quantity difference instead of temporarily removing
   the full original quantity.

The baseline starts with no suppliers, customers, inventory, formulas, batches,
sales, expenses, or transactions. It creates only two required configuration
rows: zero cash balance and the default 5,000 kg stock warning threshold.

To deploy after authenticating the Supabase CLI:

```sh
supabase link --project-ref lhnayouvcwvapzbxlolu
supabase db push
```

Alternatively, set `SUPABASE_DB_URL` to the direct database connection string
and run `supabase db push --db-url "$SUPABASE_DB_URL"`.......

## Development

```sh
npm install
npm run dev
```
