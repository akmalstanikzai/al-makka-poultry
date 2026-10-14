alter table public.supplier_transactions
  add column if not exists unit_type text check (unit_type is null or unit_type in ('kg', 'bag', 'ton')),
  add column if not exists unit_quantity numeric(18,3) check (unit_quantity is null or unit_quantity >= 0),
  add column if not exists unit_price_per_unit numeric(18,2) check (unit_price_per_unit is null or unit_price_per_unit >= 0);

alter table public.customer_transactions
  add column if not exists unit_type text check (unit_type is null or unit_type in ('kg', 'bag', 'ton')),
  add column if not exists unit_quantity numeric(18,3) check (unit_quantity is null or unit_quantity >= 0),
  add column if not exists unit_price_per_unit numeric(18,2) check (unit_price_per_unit is null or unit_price_per_unit >= 0);

update public.supplier_transactions
set unit_type = 'kg',
    unit_quantity = quantity_kg,
    unit_price_per_unit = unit_price
where unit_type is null
  and quantity_kg is not null;

update public.customer_transactions
set unit_type = 'kg',
    unit_quantity = quantity_kg,
    unit_price_per_unit = unit_price
where unit_type is null
  and quantity_kg is not null;

comment on column public.supplier_transactions.unit_type is
  'Unit selected for the original purchase or processed-goods settlement: kg, bag, or ton.';
comment on column public.supplier_transactions.unit_quantity is
  'Quantity entered in the selected transaction unit.';
comment on column public.supplier_transactions.unit_price_per_unit is
  'Price entered for one selected transaction unit.';

comment on column public.customer_transactions.unit_type is
  'Unit selected for the original sale or raw-material settlement: kg, bag, or ton.';
comment on column public.customer_transactions.unit_quantity is
  'Quantity entered in the selected transaction unit.';
comment on column public.customer_transactions.unit_price_per_unit is
  'Price entered for one selected transaction unit.';
