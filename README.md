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
   public application schema while preserving Supabase Auth accounts...2. The dated follow-up migrations add the supplier/customer settlement and
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
7. `20261017010000_fix_cross_currency_raw_settlement_corrections.sql` handles a
   currency correction that moves a receipt between same-named raw-material
   inventory rows without temporarily making the original row negative.
8. `20261017020000_allow_flexible_raw_transaction_corrections.sql` allows an
   incoming raw-material correction to change material, currency, quantity, and
   price while capping inventory reversals at the physical stock on hand.
9. `20261018000000_repair_orphaned_raw_transaction_links.sql` repairs legacy
   purchase/settlement links whose inventory row was replaced, resolves future
   missing links by normalized material name, and lets voids safely remove only
   the matching stock still on hand.
10. `20261018010000_reconcile_goods_settlement_totals.sql` recalculates customer
    raw-settlement and supplier processed-goods totals from active ledger rows,
    repairs balances after duplicate rows are voided, and keeps those summaries
    synchronized automatically.
11. `20261125000000_fix_raw_history_currency_corrections.sql` lets a receipt
    correction keep its raw material when switching between AFN and USD. It
    updates the remaining stock's two currency value pools independently and
    retains the original transaction and correction audit. Existing installations
    must apply this migration to enable saving these corrections. Installing it
    does not rewrite existing records.

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

## Reading changes made in Supabase

The app loads all rows, including when the Supabase API row limit is lower
than the requested page size. Use the refresh icon in the top bar to reload
changes made directly in Supabase. Refresh waits for pending app edits to save
and never writes fetched records back to the database or recalculates saved
balances/payments. Historical transaction balances remain the values recorded
on those transactions.

Supplier IDs are shown in full and can be searched. Transactions belong to the
supplier whose `id` exactly matches their `supplier_id`; similarly named supplier
rows remain separate. For example, changing supplier `01` does not change a
different supplier row with a generated ID. No records are merged by name.

## Reports and transaction dates

Sales, raw-material purchases/restocks, supplier goods settlements, customer
raw-material settlements, cash payments, and expenses accept a transaction date.
It defaults to the local day and is saved on linked ledger records as well.
Existing transaction-history corrections can change an older record's date.

Reports support a selected day, seven days ending on a selected date, a full
Gregorian calendar month, an inclusive custom date range, or all dates. Print
uses a compact A4 portrait summary without individual transactions. English,
Dari, and Pashto labels, Gregorian month names, and right-to-left layouts are
supported; digits and number separators use English formatting in every language.
Sales and purchase quantities show kilos and equivalent 50 kg bags. AFN and USD
remain separate. Profit deducts cost of goods sold and expenses; purchase value
is reported separately, rather than deducted twice.
The stock summary pairs quantities with production cost, raw-material purchase
value, and processed-feed sales value. Mixed quick-sale invoices are split by
stock type; raw-material sales appear separately when present. Saved invoice
totals are preserved when allocating mixed sales. Production cost describes feed
made during the period; cost of goods sold describes goods sold during it.
Money in, money out, and net cash flow use actual cash payments on their payment
dates, including account payments, customer cash advances, fees, and counter
refunds. Invoice ledger mirrors and non-cash goods settlements are excluded.

Apply `supabase/migrations/20261124000000_add_unassigned_purchase_history.sql`
before recording purchases without a supplier account. This adds an
authenticated, RLS-protected purchase history that survives stock consumption.
Until applied, the app continues to load existing records and asks for purchase
history to be enabled before accepting a purchase without a supplier. Purchases
with supplier accounts continue to use their existing auditable ledger; customer
raw-material settlements are included as purchases. Voided and reversed records
are excluded. Old purchases without a recorded ledger cannot be reconstructed
from the remaining inventory, so the migration deliberately does not invent
historical transactions.

Run `npm test` for report calculations, date boundaries, currency separation,
settlement counting, and translation coverage. Run `npm run build` and
`npm run lint` for the production build and code checks.

`tests/raw-history-currency.test.sql` exercises receipt corrections against a
disposable PostgreSQL database with the migrations applied: currency-only edits,
partly consumed and mixed-currency stock, quantity changes, account/cash/audit
updates, material changes, voids, and failed-save rollback. Its fixtures roll back.
