do $migration$
declare
  target_customer record;
  raw_total_afn numeric;
  raw_total_usd numeric;
begin
  alter table public.customers
    add column if not exists raw_settled_amount numeric(18,2) not null default 0 check (raw_settled_amount >= 0),
    add column if not exists raw_settled_amount_usd numeric(18,2) not null default 0 check (raw_settled_amount_usd >= 0),
    add column if not exists credit_balance numeric(18,2) not null default 0 check (credit_balance >= 0),
    add column if not exists credit_balance_usd numeric(18,2) not null default 0 check (credit_balance_usd >= 0);

  -- Restore حضرت علی's complete raw-material settlement value from his
  -- customer ledger. Older code sometimes stored only the portion that
  -- cancelled existing customer debt, leaving the excess credit at zero.
  for target_customer in
    select customer.*
    from public.customers customer
    where position('حضرت' in replace(replace(btrim(customer.name), chr(8204), ''), ' ', '')) > 0
      and position('عل' in replace(replace(btrim(customer.name), chr(8204), ''), ' ', '')) > 0
  loop
    select
      coalesce(sum(case when coalesce(tx.currency, 'AFN') = 'AFN' then tx.amount else 0 end), 0),
      coalesce(sum(case when tx.currency = 'USD' then tx.amount else 0 end), 0)
    into raw_total_afn, raw_total_usd
    from public.customer_transactions tx
    where tx.customer_id = target_customer.id
      and tx.type = 'raw_goods_settlement';

    update public.customers
    set raw_settled_amount = greatest(raw_settled_amount, raw_total_afn),
        raw_settled_amount_usd = greatest(raw_settled_amount_usd, raw_total_usd)
    where id = target_customer.id;
  end loop;

  -- Recalculate debt and reverse credit independently for every customer.
  update public.customers
  set balance_owed = greatest(total_purchased_amount - total_paid - raw_settled_amount, 0),
      credit_balance = greatest(total_paid + raw_settled_amount - total_purchased_amount, 0),
      balance_owed_usd = greatest(total_purchased_amount_usd - total_paid_usd - raw_settled_amount_usd, 0),
      credit_balance_usd = greatest(total_paid_usd + raw_settled_amount_usd - total_purchased_amount_usd, 0);

  if not exists (
    select 1
    from public.customers customer
    where position('حضرت' in replace(replace(btrim(customer.name), chr(8204), ''), ' ', '')) > 0
      and position('عل' in replace(replace(btrim(customer.name), chr(8204), ''), ' ', '')) > 0
  ) then
    raise exception 'The حضرت علی customer account was not found.';
  end if;
end;
$migration$;
