begin;

alter table public.supplier_transactions
  add column if not exists raw_material_id text;

create index if not exists supplier_transactions_raw_material_id_idx
  on public.supplier_transactions(raw_material_id);

commit;
