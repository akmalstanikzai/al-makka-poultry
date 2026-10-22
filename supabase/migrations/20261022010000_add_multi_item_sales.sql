begin;

alter table public.sales
    add column if not exists items jsonb not null default '[]'::jsonb
    check (jsonb_typeof(items) = 'array');

alter table public.customer_transactions
    add column if not exists line_items jsonb not null default '[]'::jsonb
    check (jsonb_typeof(line_items) = 'array');

alter table public.customer_transactions
    add column if not exists bill_number text;

alter table public.supplier_transactions
    add column if not exists line_items jsonb not null default '[]'::jsonb
    check (jsonb_typeof(line_items) = 'array');

alter table public.supplier_transactions
    add column if not exists bill_number text;

-- Preserve every historical single-product invoice as a one-line invoice.
update public.sales
set items = jsonb_build_array(jsonb_build_object(
    'productId', coalesce(product_id, ''),
    'productName', product_name,
    'unitType', unit_type,
    'unitQuantity', unit_quantity,
    'quantityKg', quantity_kg,
    'salePricePerUnit', sale_price_per_unit,
    'totalAmount', total_amount
))
where items = '[]'::jsonb
  and product_name is not null;

update public.customer_transactions as ct
set line_items = sale.items,
    bill_number = coalesce(ct.bill_number, sale.bill_number)
from public.sales as sale
where ct.source_sale_id = sale.id
  and (ct.line_items = '[]'::jsonb or ct.bill_number is null);

update public.supplier_transactions as st
set line_items = sale.items,
    bill_number = coalesce(st.bill_number, sale.bill_number)
from public.sales as sale
where st.source_sale_id = sale.id
  and (st.line_items = '[]'::jsonb or st.bill_number is null);

commit;
