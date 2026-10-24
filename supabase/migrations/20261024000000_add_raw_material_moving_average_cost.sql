begin;

-- Raw stock may be purchased in both currencies over time. Keep two independent
-- value pools so no exchange rate is invented and production can consume the
-- correct blended cost from each pool.
alter table public.raw_materials
  add column if not exists average_cost_per_kg numeric(18,6) not null default 0
    check (average_cost_per_kg >= 0),
  add column if not exists average_cost_per_kg_usd numeric(18,6) not null default 0
    check (average_cost_per_kg_usd >= 0);

-- Existing rows had one unit price and currency. Seed that historical value
-- into its matching pool without converting between AFN and USD.
update public.raw_materials
set average_cost_per_kg = case when currency = 'AFN' then unit_price else 0 end,
    average_cost_per_kg_usd = case when currency = 'USD' then unit_price else 0 end
where average_cost_per_kg = 0
  and average_cost_per_kg_usd = 0;

comment on column public.raw_materials.average_cost_per_kg is
  'Moving-average AFN cost per kg of the quantity currently in stock.';
comment on column public.raw_materials.average_cost_per_kg_usd is
  'Moving-average USD cost per kg of the quantity currently in stock.';

commit;
