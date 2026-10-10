-- Track raw-material settlements separately from cash received from customers.
alter table public.customers
  add column if not exists raw_settled_amount numeric(18,2) not null default 0 check (raw_settled_amount >= 0),
  add column if not exists raw_settled_amount_usd numeric(18,2) not null default 0 check (raw_settled_amount_usd >= 0);

alter table public.raw_materials
  add column if not exists customer_id text;

create index if not exists raw_materials_customer_id_idx
  on public.raw_materials(customer_id);

alter table public.customer_transactions
  drop constraint if exists customer_transactions_type_check;

alter table public.customer_transactions
  add constraint customer_transactions_type_check
  check (type in ('sale', 'payment', 'raw_goods_settlement'));

alter table public.supplier_transactions
  drop constraint if exists supplier_transactions_type_check;

alter table public.supplier_transactions
  add constraint supplier_transactions_type_check
  check (type in ('purchase', 'payment', 'goods_settlement', 'customer_raw_settlement'));