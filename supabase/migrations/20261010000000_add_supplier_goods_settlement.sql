-- Track processed-goods settlements separately from cash paid to suppliers.
alter table public.suppliers
  add column if not exists goods_settled_amount numeric(18,2) not null default 0 check (goods_settled_amount >= 0),
  add column if not exists goods_settled_amount_usd numeric(18,2) not null default 0 check (goods_settled_amount_usd >= 0);

alter table public.supplier_transactions
  drop constraint if exists supplier_transactions_type_check;

alter table public.supplier_transactions
  add constraint supplier_transactions_type_check
  check (type in ('purchase', 'payment', 'goods_settlement'));