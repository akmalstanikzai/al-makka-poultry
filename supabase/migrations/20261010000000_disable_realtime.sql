-- This application reads directly from Supabase when it loads and writes
-- directly through the REST API. Publishing every table through Realtime adds
-- replication traffic without adding value, so remove the application tables
-- from the publication when they are present.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'factory_settings', 'factory_state', 'suppliers', 'customers', 'formulas',
    'raw_materials', 'processed_stock', 'supplier_transactions',
    'customer_transactions', 'production_batches', 'sales', 'expenses'
  ] loop
    if exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', table_name);
    end if;
  end loop;
end $$;
