do $migration$
begin

-- Keep opposite balances on the person's original ledger.
alter table public.suppliers
  add column if not exists receivable_balance numeric(18,2) not null default 0 check (receivable_balance >= 0),
  add column if not exists receivable_balance_usd numeric(18,2) not null default 0 check (receivable_balance_usd >= 0);

alter table public.supplier_transactions
  add column if not exists receivable_after numeric(18,2) not null default 0 check (receivable_after >= 0);

alter table public.sales
  add column if not exists supplier_id text references public.suppliers(id) on update cascade on delete set null;
create index if not exists sales_supplier_id_idx on public.sales(supplier_id);

-- Old supplier-goods settlements wrote a matching ct-<timestamp> sale into a
-- customer ledger. Match by that generated timestamp so same-name people and
-- unrelated genuine customer activity are not touched.
drop table if exists public._migration_20261012_supplier_customer_links;
create table public._migration_20261012_supplier_customer_links as
select ct.id as customer_transaction_id,
       ct.customer_id,
       st.supplier_id,
       ct.amount,
       ct.paid_amount,
       coalesce(ct.currency, 'AFN') as currency
from public.customer_transactions ct
join public.supplier_transactions st
  on st.id = 'st-' || substring(ct.id from 4)
 and st.type = 'goods_settlement'
where ct.id like 'ct-%'
  and ct.type = 'sale';

drop table if exists public._migration_20261012_generated_customers;
create table public._migration_20261012_generated_customers as
select distinct link.customer_id
from public._migration_20261012_supplier_customer_links link
where link.customer_id = 'cust-' || substring(link.customer_transaction_id from 4)
  and not exists (
    select 1 from public.customer_transactions tx
    where tx.customer_id = link.customer_id
      and not exists (
        select 1 from public._migration_20261012_supplier_customer_links linked
        where linked.customer_transaction_id = tx.id
      )
  );

update public.sales sale
set supplier_id = link.supplier_id,
    customer_id = null
from public._migration_20261012_supplier_customer_links link
where sale.id = 'sale-' || substring(link.customer_transaction_id from 4);

-- Count the full processed-goods value on the supplier ledger. The old code
-- already counted the debt offset, so only the mirrored excess is added here.
with moved as (
  select supplier_id,
         sum(case when currency = 'AFN' then greatest(amount - paid_amount, 0) else 0 end) as afn_excess,
         sum(case when currency = 'USD' then greatest(amount - paid_amount, 0) else 0 end) as usd_excess
  from public._migration_20261012_supplier_customer_links
  group by supplier_id
)
update public.suppliers supplier
set goods_settled_amount = supplier.goods_settled_amount + moved.afn_excess,
    goods_settled_amount_usd = supplier.goods_settled_amount_usd + moved.usd_excess
from moved
where supplier.id = moved.supplier_id;

-- Reverse only mirrored settlement totals on pre-existing customers. Genuine
-- sales, payments, raw settlements, and profiles remain unchanged.
with reversed as (
  select customer_id,
         sum(case when currency = 'AFN' then amount else 0 end) as afn_amount,
         sum(case when currency = 'USD' then amount else 0 end) as usd_amount,
         sum(case when currency = 'AFN' then paid_amount else 0 end) as afn_paid,
         sum(case when currency = 'USD' then paid_amount else 0 end) as usd_paid
  from public._migration_20261012_supplier_customer_links
  group by customer_id
)
update public.customers customer
set total_purchased_amount = greatest(customer.total_purchased_amount - reversed.afn_amount, 0),
    total_purchased_amount_usd = greatest(customer.total_purchased_amount_usd - reversed.usd_amount, 0),
    total_paid = greatest(customer.total_paid - reversed.afn_paid, 0),
    total_paid_usd = greatest(customer.total_paid_usd - reversed.usd_paid, 0)
from reversed
where customer.id = reversed.customer_id;

delete from public.customer_transactions tx
using public._migration_20261012_supplier_customer_links link
where tx.id = link.customer_transaction_id;

delete from public.customers customer
using public._migration_20261012_generated_customers generated
where customer.id = generated.customer_id;

-- Old customer raw-material settlements wrote a matching st-<timestamp>
-- purchase into a supplier ledger. Reverse only those generated entries.
drop table if exists public._migration_20261012_customer_supplier_links;
create table public._migration_20261012_customer_supplier_links as
select st.id as supplier_transaction_id,
       st.supplier_id,
       ct.customer_id,
       st.amount,
       st.paid_amount,
       coalesce(st.currency, 'AFN') as currency
from public.supplier_transactions st
join public.customer_transactions ct
  on ct.id = 'ct-' || substring(st.id from 4)
 and ct.type = 'raw_goods_settlement'
where st.id like 'st-%'
  and st.type = 'customer_raw_settlement';

drop table if exists public._migration_20261012_generated_suppliers;
create table public._migration_20261012_generated_suppliers as
select distinct link.supplier_id
from public._migration_20261012_customer_supplier_links link
where link.supplier_id = 'sup-' || substring(link.supplier_transaction_id from 4)
  and not exists (
    select 1 from public.supplier_transactions tx
    where tx.supplier_id = link.supplier_id
      and not exists (
        select 1 from public._migration_20261012_customer_supplier_links linked
        where linked.supplier_transaction_id = tx.id
      )
  );

update public.raw_materials raw
set supplier_id = null,
    supplier_name = null
from public._migration_20261012_customer_supplier_links link
where raw.supplier_id = link.supplier_id
  and raw.customer_id = link.customer_id;

with reversed as (
  select supplier_id,
         sum(case when currency = 'AFN' then amount else 0 end) as afn_amount,
         sum(case when currency = 'USD' then amount else 0 end) as usd_amount,
         sum(case when currency = 'AFN' then paid_amount else 0 end) as afn_settled,
         sum(case when currency = 'USD' then paid_amount else 0 end) as usd_settled
  from public._migration_20261012_customer_supplier_links
  group by supplier_id
)
update public.suppliers supplier
set total_purchased_amount = greatest(supplier.total_purchased_amount - reversed.afn_amount, 0),
    total_purchased_amount_usd = greatest(supplier.total_purchased_amount_usd - reversed.usd_amount, 0),
    goods_settled_amount = greatest(supplier.goods_settled_amount - reversed.afn_settled, 0),
    goods_settled_amount_usd = greatest(supplier.goods_settled_amount_usd - reversed.usd_settled, 0)
from reversed
where supplier.id = reversed.supplier_id;

delete from public.supplier_transactions tx
using public._migration_20261012_customer_supplier_links link
where tx.id = link.supplier_transaction_id;

delete from public.suppliers supplier
using public._migration_20261012_generated_suppliers generated
where supplier.id = generated.supplier_id;

-- Recalculate both ledgers after the targeted historical reversal. Manually
-- edited totals and unrelated transactions are preserved.
update public.customers
set balance_owed = greatest(total_purchased_amount - total_paid - raw_settled_amount, 0),
    credit_balance = greatest(total_paid + raw_settled_amount - total_purchased_amount, 0),
    balance_owed_usd = greatest(total_purchased_amount_usd - total_paid_usd - raw_settled_amount_usd, 0),
    credit_balance_usd = greatest(total_paid_usd + raw_settled_amount_usd - total_purchased_amount_usd, 0);

update public.suppliers
set balance_owed = greatest(total_purchased_amount - total_paid - goods_settled_amount, 0),
    receivable_balance = greatest(total_paid + goods_settled_amount - total_purchased_amount, 0),
    balance_owed_usd = greatest(total_purchased_amount_usd - total_paid_usd - goods_settled_amount_usd, 0),
    receivable_balance_usd = greatest(total_paid_usd + goods_settled_amount_usd - total_purchased_amount_usd, 0);

drop table if exists public._migration_20261012_generated_suppliers;
drop table if exists public._migration_20261012_customer_supplier_links;
drop table if exists public._migration_20261012_generated_customers;
drop table if exists public._migration_20261012_supplier_customer_links;

end;
$migration$;
