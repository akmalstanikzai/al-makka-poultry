do $migration$
declare
  wrong_customer record;
  wrong_supplier record;
  target_supplier_id text;
  target_customer_id text;
  afn_amount numeric;
  usd_amount numeric;
  afn_settled numeric;
  usd_settled numeric;
begin
  -- Keep this repair independent from earlier partially-run migrations.
  alter table public.suppliers
    add column if not exists receivable_balance numeric(18,2) not null default 0 check (receivable_balance >= 0),
    add column if not exists receivable_balance_usd numeric(18,2) not null default 0 check (receivable_balance_usd >= 0);

  alter table public.sales
    add column if not exists supplier_id text references public.suppliers(id) on update cascade on delete set null;

  create index if not exists sales_supplier_id_idx on public.sales(supplier_id);

  -- Customer #450101 is actually the supplier سبحان الله حاجی.
  select customer.*
    into wrong_customer
  from public.customers customer
  where right(customer.id, 6) = '450101'
  limit 1;

  if wrong_customer.id is null then
    raise exception 'Customer record #450101 was not found.';
  end if;

  select supplier.id
    into target_supplier_id
  from public.suppliers supplier
  where regexp_replace(replace(btrim(supplier.name), chr(8204), ''), '\s+', ' ', 'g') =
          regexp_replace(replace(btrim(wrong_customer.name), chr(8204), ''), '\s+', ' ', 'g')
     or (
       position('سبحان' in supplier.name) > 0
       and position('الله' in supplier.name) > 0
       and position('حاج' in supplier.name) > 0
     )
     or (
       regexp_replace(coalesce(wrong_customer.phone, ''), '[^0-9]', '', 'g') <> ''
       and regexp_replace(coalesce(supplier.phone, ''), '[^0-9]', '', 'g') =
           regexp_replace(coalesce(wrong_customer.phone, ''), '[^0-9]', '', 'g')
     )
  order by
    (regexp_replace(replace(btrim(supplier.name), chr(8204), ''), '\s+', ' ', 'g') =
     regexp_replace(replace(btrim(wrong_customer.name), chr(8204), ''), '\s+', ' ', 'g')) desc,
    (select count(*) from public.supplier_transactions tx where tx.supplier_id = supplier.id) desc,
    supplier.created_at asc
  limit 1;

  if target_supplier_id is null then
    raise exception 'The matching supplier account for customer #450101 (سبحان الله حاجی) was not found.';
  end if;

  update public.sales
  set supplier_id = target_supplier_id,
      customer_id = null
  where customer_id = wrong_customer.id;

  -- The debt-offset portion is already recorded on the supplier account. A
  -- positive customer balance is only the excess value owed by the supplier.
  update public.suppliers
  set goods_settled_amount = goods_settled_amount + coalesce(wrong_customer.balance_owed, 0),
      goods_settled_amount_usd = goods_settled_amount_usd + coalesce(wrong_customer.balance_owed_usd, 0)
  where id = target_supplier_id;

  delete from public.customers where id = wrong_customer.id;

  -- Supplier #933321 is actually the customer حضرت علی.
  select supplier.*
    into wrong_supplier
  from public.suppliers supplier
  where right(supplier.id, 6) = '933321'
  limit 1;

  if wrong_supplier.id is null then
    raise exception 'Supplier record #933321 was not found.';
  end if;

  select customer.id
    into target_customer_id
  from public.customers customer
  where regexp_replace(replace(btrim(customer.name), chr(8204), ''), '\s+', ' ', 'g') =
          regexp_replace(replace(btrim(wrong_supplier.name), chr(8204), ''), '\s+', ' ', 'g')
     or (
       position('حضرت' in customer.name) > 0
       and position('عل' in customer.name) > 0
     )
     or (
       regexp_replace(coalesce(wrong_supplier.phone, ''), '[^0-9]', '', 'g') <> ''
       and regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g') =
           regexp_replace(coalesce(wrong_supplier.phone, ''), '[^0-9]', '', 'g')
     )
  order by
    (regexp_replace(replace(btrim(customer.name), chr(8204), ''), '\s+', ' ', 'g') =
     regexp_replace(replace(btrim(wrong_supplier.name), chr(8204), ''), '\s+', ' ', 'g')) desc,
    (select count(*) from public.customer_transactions tx where tx.customer_id = customer.id) desc,
    customer.created_at asc
  limit 1;

  if target_customer_id is null then
    raise exception 'The matching customer account for supplier #933321 (حضرت علی) was not found.';
  end if;

  select
    coalesce(sum(case when coalesce(tx.currency, 'AFN') = 'AFN' then tx.amount else 0 end), 0),
    coalesce(sum(case when tx.currency = 'USD' then tx.amount else 0 end), 0),
    coalesce(sum(case when coalesce(tx.currency, 'AFN') = 'AFN' then tx.paid_amount else 0 end), 0),
    coalesce(sum(case when tx.currency = 'USD' then tx.paid_amount else 0 end), 0)
  into afn_amount, usd_amount, afn_settled, usd_settled
  from public.supplier_transactions tx
  where tx.supplier_id = wrong_supplier.id
    and tx.type = 'customer_raw_settlement';

  -- Remove the supplier-side mirror; the original raw-material settlement and
  -- its history remain on the حضرت علی customer account.
  update public.suppliers
  set total_purchased_amount = greatest(total_purchased_amount - afn_amount, 0),
      total_purchased_amount_usd = greatest(total_purchased_amount_usd - usd_amount, 0),
      goods_settled_amount = greatest(goods_settled_amount - afn_settled, 0),
      goods_settled_amount_usd = greatest(goods_settled_amount_usd - usd_settled, 0)
  where id = wrong_supplier.id;

  update public.raw_materials
  set supplier_id = null,
      supplier_name = null,
      customer_id = target_customer_id
  where supplier_id = wrong_supplier.id;

  delete from public.supplier_transactions
  where supplier_id = wrong_supplier.id
    and type = 'customer_raw_settlement';

  if exists (
    select 1 from public.supplier_transactions tx
    where tx.supplier_id = wrong_supplier.id
  ) then
    raise exception 'Supplier #933321 also has genuine supplier transactions; automatic removal was stopped to prevent history loss.';
  end if;

  delete from public.suppliers where id = wrong_supplier.id;

  if exists (select 1 from public.customers where right(id, 6) = '450101') then
    raise exception 'Customer #450101 is still present after repair.';
  end if;

  if exists (select 1 from public.suppliers where right(id, 6) = '933321') then
    raise exception 'Supplier #933321 is still present after repair.';
  end if;

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
end;
$migration$;
