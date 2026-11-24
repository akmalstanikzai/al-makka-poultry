begin;

-- Purchases with a named supplier stay in supplier_transactions so existing
-- audited corrections remain authoritative. Preserve purchases without an
-- account separately; current stock cannot reconstruct historical purchases.
create table if not exists public.raw_material_purchases (
  id text primary key,
  date date not null,
  item_name text not null,
  quantity_kg numeric not null check (quantity_kg > 0),
  unit_type text not null check (unit_type in ('kg', 'bag', 'ton')),
  unit_quantity numeric not null check (unit_quantity > 0),
  unit_price_per_unit numeric not null check (unit_price_per_unit >= 0),
  amount numeric not null check (amount >= 0),
  paid_amount numeric not null default 0 check (paid_amount >= 0),
  currency text not null check (currency in ('AFN', 'USD')),
  created_at timestamptz not null default now()
);
create index if not exists raw_material_purchases_date_idx on public.raw_material_purchases(date);
alter table public.raw_material_purchases enable row level security;
create policy "Authenticated users have full access" on public.raw_material_purchases
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.raw_material_purchases to authenticated;
revoke all on public.raw_material_purchases from anon;

commit;
