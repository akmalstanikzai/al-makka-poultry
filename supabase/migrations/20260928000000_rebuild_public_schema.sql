-- Destructive baseline migration for the Al-Makka factory application.
-- Supabase Auth (auth.*) is intentionally preserved.

begin;

drop table if exists public.customer_transactions cascade;
drop table if exists public.supplier_transactions cascade;
drop table if exists public.sales cascade;
drop table if exists public.production_batches cascade;
drop table if exists public.processed_stock cascade;
drop table if exists public.raw_materials cascade;
drop table if exists public.expenses cascade;
drop table if exists public.formulas cascade;
drop table if exists public.customers cascade;
drop table if exists public.suppliers cascade;
drop table if exists public.factory_settings cascade;
drop table if exists public.factory_state cascade;
drop table if exists public.users cascade;

create table public.factory_settings (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.factory_state (
  id text primary key,
  cash_in_hand numeric(18,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table public.suppliers (
  id text primary key,
  name text not null check (btrim(name) <> ''),
  phone text,
  address text,
  total_purchased_amount numeric(18,2) not null default 0 check (total_purchased_amount >= 0),
  total_paid numeric(18,2) not null default 0 check (total_paid >= 0),
  balance_owed numeric(18,2) not null default 0 check (balance_owed >= 0),
  created_at date not null default current_date
);

create table public.customers (
  id text primary key,
  name text not null check (btrim(name) <> ''),
  phone text,
  address text,
  total_purchased_amount numeric(18,2) not null default 0 check (total_purchased_amount >= 0),
  total_paid numeric(18,2) not null default 0 check (total_paid >= 0),
  balance_owed numeric(18,2) not null default 0 check (balance_owed >= 0),
  created_at date not null default current_date
);

create table public.formulas (
  id text primary key,
  name text not null check (btrim(name) <> ''),
  description text,
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  date_created date not null default current_date
);

create table public.raw_materials (
  id text primary key,
  name text not null check (btrim(name) <> ''),
  category text not null check (btrim(category) <> ''),
  stock_kg numeric(18,3) not null default 0 check (stock_kg >= 0),
  unit_price numeric(18,2) not null default 0 check (unit_price >= 0),
  supplier_id text references public.suppliers(id) on update cascade on delete set null,
  supplier_name text,
  date_added date not null default current_date,
  notes text,
  low_stock_threshold numeric(18,3) not null default 5000 check (low_stock_threshold >= 0)
);

create table public.processed_stock (
  id text primary key,
  name text not null check (btrim(name) <> ''),
  formula_id text references public.formulas(id) on update cascade on delete set null,
  stock_kg numeric(18,3) not null default 0 check (stock_kg >= 0),
  average_cost_per_kg numeric(18,4) not null default 0 check (average_cost_per_kg >= 0),
  last_updated date not null default current_date
);

create table public.supplier_transactions (
  id text primary key,
  supplier_id text not null references public.suppliers(id) on update cascade on delete cascade,
  raw_material_id text,
  date date not null default current_date,
  type text not null check (type in ('purchase', 'payment')),
  description text not null,
  amount numeric(18,2) not null default 0 check (amount >= 0),
  paid_amount numeric(18,2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(18,2) not null default 0 check (remaining_amount >= 0)
);

create table public.customer_transactions (
  id text primary key,
  customer_id text not null references public.customers(id) on update cascade on delete cascade,
  date date not null default current_date,
  type text not null check (type in ('sale', 'payment')),
  description text not null,
  amount numeric(18,2) not null default 0 check (amount >= 0),
  paid_amount numeric(18,2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(18,2) not null default 0 check (remaining_amount >= 0)
);

create table public.production_batches (
  id text primary key,
  date date not null default current_date,
  formula_id text references public.formulas(id) on update cascade on delete set null,
  formula_name text not null,
  total_weight_kg numeric(18,3) not null check (total_weight_kg > 0),
  cost_per_kg numeric(18,4) not null default 0 check (cost_per_kg >= 0),
  total_cost numeric(18,2) not null default 0 check (total_cost >= 0),
  operator_name text,
  notes text
);

create table public.sales (
  id text primary key,
  date date not null default current_date,
  product_id text references public.processed_stock(id) on update cascade on delete set null,
  product_name text not null,
  customer_id text references public.customers(id) on update cascade on delete set null,
  customer_name text not null,
  customer_phone text,
  unit_type text not null check (unit_type in ('kg', 'bag', 'ton')),
  unit_quantity numeric(18,3) not null check (unit_quantity > 0),
  quantity_kg numeric(18,3) not null check (quantity_kg > 0),
  sale_price_per_unit numeric(18,2) not null check (sale_price_per_unit >= 0),
  total_amount numeric(18,2) not null check (total_amount >= 0),
  paid_amount numeric(18,2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(18,2) not null default 0 check (remaining_amount >= 0),
  total_cost_of_goods numeric(18,2) not null default 0 check (total_cost_of_goods >= 0),
  profit numeric(18,2) not null default 0,
  notes text
);

create table public.expenses (
  id text primary key,
  date date not null default current_date,
  category text not null check (btrim(category) <> ''),
  amount numeric(18,2) not null check (amount > 0),
  description text not null check (btrim(description) <> ''),
  paid_by text,
  notes text
);

create index raw_materials_supplier_id_idx on public.raw_materials(supplier_id);
create index processed_stock_formula_id_idx on public.processed_stock(formula_id);
create index supplier_transactions_supplier_id_date_idx on public.supplier_transactions(supplier_id, date desc);
create index customer_transactions_customer_id_date_idx on public.customer_transactions(customer_id, date desc);
create index production_batches_date_idx on public.production_batches(date desc);
create index sales_date_idx on public.sales(date desc);
create index sales_customer_id_idx on public.sales(customer_id);
create index expenses_date_idx on public.expenses(date desc);

insert into public.factory_state (id, cash_in_hand) values ('default', 0);
insert into public.factory_settings (key, data)
values ('inventory', jsonb_build_object('lowStockThreshold', 5000));

-- This is a single-factory application: every authenticated account shares
-- the same rows, while anonymous visitors receive no database access.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'factory_settings', 'factory_state', 'suppliers', 'customers', 'formulas',
    'raw_materials', 'processed_stock', 'supplier_transactions',
    'customer_transactions', 'production_batches', 'sales', 'expenses'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy "Authenticated users have full access" on public.%I for all to authenticated using (true) with check (true)',
      table_name
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('revoke all on public.%I from anon', table_name);
  end loop;
end $$;

commit;
