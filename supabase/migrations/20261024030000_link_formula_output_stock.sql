begin;

alter table public.formulas
  add column if not exists output_stock_id text;

alter table public.production_batches
  add column if not exists processed_stock_id text;

create index if not exists formulas_output_stock_id_idx
  on public.formulas(output_stock_id);

create index if not exists production_batches_processed_stock_id_idx
  on public.production_batches(processed_stock_id);

comment on column public.formulas.output_stock_id is
  'Processed-stock destination selected for future batches made from this formula.';

comment on column public.production_batches.processed_stock_id is
  'Exact processed-stock record that received this batch.';

commit;
