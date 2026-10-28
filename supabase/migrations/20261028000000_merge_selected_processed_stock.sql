begin;

create table if not exists public.processed_stock_merge_audit (
  id bigint generated always as identity primary key,
  source_name text not null,
  target_name text not null,
  target_stock_id text not null,
  source_stock_ids jsonb not null default '[]'::jsonb,
  source_snapshot jsonb not null default '[]'::jsonb,
  target_snapshot_before jsonb not null,
  target_snapshot_after jsonb not null,
  merged_at timestamptz not null default now()
);

alter table public.processed_stock_merge_audit enable row level security;
drop policy if exists "Authenticated users can read processed stock merge audit" on public.processed_stock_merge_audit;
create policy "Authenticated users can read processed stock merge audit"
  on public.processed_stock_merge_audit for select to authenticated using (true);
grant select on public.processed_stock_merge_audit to authenticated;
revoke all on public.processed_stock_merge_audit from anon;

create or replace function public._normalize_processed_stock_merge_name(p_value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value text := lower(coalesce(p_value, ''));
begin
  v_value := normalize(v_value, NFKC);
  v_value := replace(replace(replace(v_value, 'ي', 'ی'), 'ى', 'ی'), 'ك', 'ک');
  v_value := translate(v_value, '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789');
  v_value := translate(v_value,
    chr(8203) || chr(8204) || chr(8205) || chr(8206) || chr(8207) || chr(65279)
      || chr(8234) || chr(8235) || chr(8236) || chr(8237) || chr(8238)
      || chr(8294) || chr(8295) || chr(8296) || chr(8297),
    '');
  return btrim(regexp_replace(v_value, '[[:space:]]+', ' ', 'g'));
end;
$$;

create or replace function public._replace_processed_stock_json_reference(
  p_items jsonb,
  p_source_id text,
  p_target_id text,
  p_target_name text,
  p_counter_format boolean default false
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(
    case
      when p_counter_format
        and item.value->>'stockType' = 'processed'
        and item.value->>'stockId' = p_source_id
      then jsonb_set(
        jsonb_set(item.value, '{stockId}', to_jsonb(p_target_id), true),
        '{stockName}', to_jsonb(p_target_name), true)
      when not p_counter_format and item.value->>'productId' = p_source_id
      then jsonb_set(
        jsonb_set(item.value, '{productId}', to_jsonb(p_target_id), true),
        '{productName}', to_jsonb(p_target_name), true)
      else item.value
    end order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as item(value, ordinality);
$$;

create or replace function public._merge_processed_stock_by_name(
  p_source_name text,
  p_target_name text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_target public.processed_stock%rowtype;
  v_source public.processed_stock%rowtype;
  v_target_count integer;
  v_source_count integer;
  v_source_kg numeric := 0;
  v_source_value_afn numeric := 0;
  v_source_value_usd numeric := 0;
  v_new_kg numeric;
  v_new_average_afn numeric;
  v_new_average_usd numeric;
  v_source_ids jsonb;
  v_source_snapshot jsonb;
  v_target_before jsonb;
  v_target_after jsonb;
begin
  select count(*) into v_target_count
  from public.processed_stock
  where public._normalize_processed_stock_merge_name(name)
    = public._normalize_processed_stock_merge_name(p_target_name);

  if v_target_count <> 1 then
    raise exception 'Expected exactly one target processed stock named %, found %.', p_target_name, v_target_count;
  end if;

  select * into strict v_target
  from public.processed_stock
  where public._normalize_processed_stock_merge_name(name)
    = public._normalize_processed_stock_merge_name(p_target_name)
  for update;

  select count(*),
         coalesce(sum(stock_kg), 0),
         coalesce(sum(stock_kg * average_cost_per_kg), 0),
         coalesce(sum(stock_kg * coalesce(average_cost_per_kg_usd, 0)), 0),
         coalesce(jsonb_agg(to_jsonb(id)), '[]'::jsonb),
         coalesce(jsonb_agg(to_jsonb(source_row)), '[]'::jsonb)
  into v_source_count, v_source_kg, v_source_value_afn, v_source_value_usd,
       v_source_ids, v_source_snapshot
  from public.processed_stock as source_row
  where public._normalize_processed_stock_merge_name(name)
    = public._normalize_processed_stock_merge_name(p_source_name)
    and id <> v_target.id;

  if v_source_count = 0 then
    if exists (
      select 1 from public.processed_stock_merge_audit
      where public._normalize_processed_stock_merge_name(source_name)
          = public._normalize_processed_stock_merge_name(p_source_name)
        and public._normalize_processed_stock_merge_name(target_name)
          = public._normalize_processed_stock_merge_name(p_target_name)
        and target_stock_id = v_target.id
    ) then
      raise notice 'Processed stock % was already merged into %.', p_source_name, p_target_name;
      return;
    end if;
    raise exception 'No source processed stock named % was found.', p_source_name;
  end if;

  v_target_before := to_jsonb(v_target);
  v_new_kg := coalesce(v_target.stock_kg, 0) + v_source_kg;
  v_new_average_afn := case when v_new_kg > 0 then
    ((coalesce(v_target.stock_kg, 0) * coalesce(v_target.average_cost_per_kg, 0)) + v_source_value_afn) / v_new_kg
    else 0 end;
  v_new_average_usd := case when v_new_kg > 0 then
    ((coalesce(v_target.stock_kg, 0) * coalesce(v_target.average_cost_per_kg_usd, 0)) + v_source_value_usd) / v_new_kg
    else 0 end;

  update public.processed_stock
  set stock_kg = v_new_kg,
      average_cost_per_kg = v_new_average_afn,
      average_cost_per_kg_usd = v_new_average_usd,
      formula_id = coalesce(v_target.formula_id, (
        select formula_id from public.processed_stock
        where public._normalize_processed_stock_merge_name(name)
          = public._normalize_processed_stock_merge_name(p_source_name)
          and formula_id is not null
        order by last_updated desc nulls last, id
        limit 1
      )),
      last_updated = greatest(v_target.last_updated, (
        select max(last_updated) from public.processed_stock
        where public._normalize_processed_stock_merge_name(name)
          = public._normalize_processed_stock_merge_name(p_source_name)
      ))
  where id = v_target.id;

  for v_source in
    select * from public.processed_stock
    where public._normalize_processed_stock_merge_name(name)
      = public._normalize_processed_stock_merge_name(p_source_name)
      and id <> v_target.id
    for update
  loop
    update public.sales
    set product_id = case when product_id = v_source.id then v_target.id else product_id end,
        product_name = case when product_id = v_source.id then v_target.name else product_name end,
        items = public._replace_processed_stock_json_reference(items, v_source.id, v_target.id, v_target.name, false)
    where product_id = v_source.id
       or items @> jsonb_build_array(jsonb_build_object('productId', v_source.id));

    update public.customer_transactions
    set product_id = case when product_id = v_source.id then v_target.id else product_id end,
        item_name = case when product_id = v_source.id then v_target.name else item_name end,
        line_items = public._replace_processed_stock_json_reference(line_items, v_source.id, v_target.id, v_target.name, false)
    where product_id = v_source.id
       or line_items @> jsonb_build_array(jsonb_build_object('productId', v_source.id));

    update public.supplier_transactions
    set product_id = case when product_id = v_source.id then v_target.id else product_id end,
        item_name = case when product_id = v_source.id then v_target.name else item_name end,
        line_items = public._replace_processed_stock_json_reference(line_items, v_source.id, v_target.id, v_target.name, false)
    where product_id = v_source.id
       or line_items @> jsonb_build_array(jsonb_build_object('productId', v_source.id));

    update public.counter_sales
    set items = public._replace_processed_stock_json_reference(items, v_source.id, v_target.id, v_target.name, true)
    where items @> jsonb_build_array(jsonb_build_object('stockType', 'processed', 'stockId', v_source.id));

    update public.counter_customer_transactions
    set items = public._replace_processed_stock_json_reference(items, v_source.id, v_target.id, v_target.name, true)
    where items @> jsonb_build_array(jsonb_build_object('stockType', 'processed', 'stockId', v_source.id));

    update public.formulas
    set output_stock_id = v_target.id
    where output_stock_id = v_source.id;

    update public.production_batches
    set processed_stock_id = v_target.id
    where processed_stock_id = v_source.id;
  end loop;

  select to_jsonb(stock_row) into v_target_after
  from public.processed_stock as stock_row
  where id = v_target.id;

  insert into public.processed_stock_merge_audit (
    source_name, target_name, target_stock_id, source_stock_ids,
    source_snapshot, target_snapshot_before, target_snapshot_after
  ) values (
    p_source_name, p_target_name, v_target.id, v_source_ids,
    v_source_snapshot, v_target_before, v_target_after
  );

  delete from public.processed_stock
  where public._normalize_processed_stock_merge_name(name)
    = public._normalize_processed_stock_merge_name(p_source_name)
    and id <> v_target.id;
end;
$$;

select public._merge_processed_stock_by_name('9 نمبر', '9 نمبر دانه');
select public._merge_processed_stock_by_name('4 نمبر', '4 نمبر دانه');

drop function public._merge_processed_stock_by_name(text, text);
drop function public._replace_processed_stock_json_reference(jsonb, text, text, text, boolean);
drop function public._normalize_processed_stock_merge_name(text);

commit;
