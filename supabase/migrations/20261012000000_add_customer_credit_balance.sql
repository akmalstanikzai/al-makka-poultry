-- Keep customer overpayments separate from receivable debt. A customer can
-- owe the factory, or the factory can owe the customer, but never both in the
-- same currency at the same time.
alter table public.customers
  add column if not exists credit_balance numeric(18,2) not null default 0 check (credit_balance >= 0),
  add column if not exists credit_balance_usd numeric(18,2) not null default 0 check (credit_balance_usd >= 0);

update public.customers
set
  balance_owed = greatest(0, total_purchased_amount - total_paid - raw_settled_amount),
  credit_balance = greatest(0, total_paid + raw_settled_amount - total_purchased_amount),
  balance_owed_usd = greatest(0, total_purchased_amount_usd - total_paid_usd - raw_settled_amount_usd),
  credit_balance_usd = greatest(0, total_paid_usd + raw_settled_amount_usd - total_purchased_amount_usd);
