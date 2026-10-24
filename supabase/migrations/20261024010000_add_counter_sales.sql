begin;

create table if not exists public.counter_customers (
  id text primary key,
  name text not null check (btrim(name) <> ''),
  phone text,
  total_purchased_amount numeric(18,2) not null default 0 check (total_purchased_amount >= 0),
  total_purchased_amount_usd numeric(18,2) not null default 0 check (total_purchased_amount_usd >= 0),
  total_paid numeric(18,2) not null default 0 check (total_paid >= 0),
  total_paid_usd numeric(18,2) not null default 0 check (total_paid_usd >= 0),
  balance_owed numeric(18,2) not null default 0 check (balance_owed >= 0),
  balance_owed_usd numeric(18,2) not null default 0 check (balance_owed_usd >= 0),
  created_at date not null default current_date,
  updated_at timestamptz not null default now()
);

create table if not exists public.counter_sales (
  id text primary key,
  bill_number text not null check (btrim(bill_number) <> ''),
  counter_customer_id text not null references public.counter_customers(id) on update cascade on delete restrict,
  customer_name text not null,
  customer_phone text,
  date date not null default current_date,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  total_quantity_kg numeric(18,3) not null default 0 check (total_quantity_kg >= 0),
  total_amount numeric(18,2) not null default 0 check (total_amount >= 0),
  paid_amount numeric(18,2) not null default 0 check (paid_amount >= 0),
  cash_amount numeric(18,2) not null default 0 check (cash_amount >= 0),
  remaining_amount numeric(18,2) not null default 0 check (remaining_amount >= 0),
  total_cost_of_goods numeric(18,4) not null default 0 check (total_cost_of_goods >= 0),
  total_cost_of_goods_usd numeric(18,4) not null default 0 check (total_cost_of_goods_usd >= 0),
  profit numeric(18,4) not null default 0,
  profit_usd numeric(18,4) not null default 0,
  currency text not null default 'AFN' check (currency in ('AFN','USD')),
  notes text,
  status text not null default 'active' check (status in ('active','voided')),
  created_at timestamptz not null default now()
);

create table if not exists public.counter_customer_transactions (
  id text primary key,
  counter_customer_id text not null references public.counter_customers(id) on update cascade on delete cascade,
  source_sale_id text references public.counter_sales(id) on update cascade on delete set null,
  bill_number text,
  date date not null default current_date,
  type text not null check (type in ('sale','payment')),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  description text,
  amount numeric(18,2) not null default 0 check (amount >= 0),
  paid_amount numeric(18,2) not null default 0 check (paid_amount >= 0),
  cash_amount numeric(18,2) not null default 0 check (cash_amount >= 0),
  remaining_amount numeric(18,2) not null default 0 check (remaining_amount >= 0),
  currency text not null default 'AFN' check (currency in ('AFN','USD')),
  created_at timestamptz not null default now()
);

create unique index if not exists counter_sales_bill_number_unique_idx
  on public.counter_sales (lower(btrim(bill_number)));
create index if not exists counter_sales_customer_date_idx
  on public.counter_sales(counter_customer_id,date desc);
create index if not exists counter_customer_transactions_customer_date_idx
  on public.counter_customer_transactions(counter_customer_id,date desc);

-- Serialize bill-number checks so ordinary sales and counter sales share one
-- safe namespace even though PostgreSQL cannot create a cross-table index.
create or replace function public.enforce_factory_bill_number()
returns trigger language plpgsql set search_path=public as $$
declare
  v_bill text := lower(btrim(new.bill_number));
begin
  if v_bill = '' then raise exception 'Bill number is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_bill, 0));
  if tg_table_name = 'sales' then
    if exists(select 1 from public.counter_sales where lower(btrim(bill_number))=v_bill) then
      raise exception 'This bill number is already in use.';
    end if;
  else
    if exists(select 1 from public.sales where bill_number is not null and lower(btrim(bill_number))=v_bill) then
      raise exception 'This bill number is already in use.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists enforce_factory_bill_number_on_sales on public.sales;
create trigger enforce_factory_bill_number_on_sales
before insert or update of bill_number on public.sales
for each row when (new.bill_number is not null)
execute function public.enforce_factory_bill_number();

drop trigger if exists enforce_factory_bill_number_on_counter_sales on public.counter_sales;
create trigger enforce_factory_bill_number_on_counter_sales
before insert or update of bill_number on public.counter_sales
for each row execute function public.enforce_factory_bill_number();

create or replace function public.bill_number_exists(p_bill_number text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.sales
    where bill_number is not null and lower(btrim(bill_number))=lower(btrim(p_bill_number))
    union all
    select 1 from public.counter_sales
    where lower(btrim(bill_number))=lower(btrim(p_bill_number))
  );
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['counter_customers','counter_sales','counter_customer_transactions'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "Authenticated users have full access" on public.%I', table_name);
    execute format('create policy "Authenticated users have full access" on public.%I for all to authenticated using (true) with check (true)', table_name);
    execute format('grant select,insert,update,delete on public.%I to authenticated', table_name);
    execute format('revoke all on public.%I from anon', table_name);
  end loop;
end $$;

revoke all on function public.bill_number_exists(text) from public,anon;
grant execute on function public.bill_number_exists(text) to authenticated;
revoke all on function public.enforce_factory_bill_number() from public,anon,authenticated;

commit;
