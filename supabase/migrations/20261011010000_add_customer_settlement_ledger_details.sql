alter table public.customer_transactions
  add column if not exists item_name text,
  add column if not exists quantity_kg numeric(18,3) check (quantity_kg is null or quantity_kg >= 0),
  add column if not exists unit_price numeric(18,2) check (unit_price is null or unit_price >= 0),
  add column if not exists account_balance_after numeric(18,2) check (account_balance_after is null or account_balance_after >= 0);

comment on column public.customer_transactions.item_name is
  'Exact user-entered raw-stock name used for a non-cash customer settlement.';
comment on column public.customer_transactions.quantity_kg is
  'Raw-material settlement quantity converted to kilograms.';
comment on column public.customer_transactions.unit_price is
  'Raw-material valuation per kilogram in the transaction currency.';
comment on column public.customer_transactions.account_balance_after is
  'Customer balance immediately after this transaction.';
