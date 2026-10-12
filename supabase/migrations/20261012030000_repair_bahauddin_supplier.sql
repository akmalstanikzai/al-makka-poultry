do $migration$
declare
  wrong_customer record;
  target_supplier_id text;
begin
  -- Required by processed-goods supplier settlements. Repeated here so this
  -- focused repair is safe even if an earlier cleanup migration was partial.
  alter table public.suppliers
    add column if not exists receivable_balance numeric(18,2) not null default 0 check (receivable_balance >= 0),
    add column if not exists receivable_balance_usd numeric(18,2) not null default 0 check (receivable_balance_usd >= 0);

  alter table public.sales
    add column if not exists supplier_id text references public.suppliers(id) on update cascade on delete set null;

  create index if not exists sales_supplier_id_idx on public.sales(supplier_id);

  -- Use the phone and visible id suffix from the supplied screenshot. The name
  -- checks are fallbacks for databases where the phone was formatted or empty.
  for wrong_customer in
    select customer.*
    from public.customers customer
    where regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g') = '0789206027'
       or right(customer.id, 6) = '981985'
       or (
         position('بهاء' in replace(replace(btrim(customer.name), chr(8204), ''), ' ', '')) > 0
         and position('الدین' in replace(replace(btrim(customer.name), chr(8204), ''), ' ', '')) > 0
       )
  loop
    target_supplier_id := null;

    select supplier.id
      into target_supplier_id
    from public.suppliers supplier
    where regexp_replace(coalesce(supplier.phone, ''), '[^0-9]', '', 'g') = '0789206027'
       or (
         regexp_replace(coalesce(wrong_customer.phone, ''), '[^0-9]', '', 'g') <> ''
         and regexp_replace(coalesce(supplier.phone, ''), '[^0-9]', '', 'g') =
             regexp_replace(coalesce(wrong_customer.phone, ''), '[^0-9]', '', 'g')
       )
       or (
         position('بهاء' in replace(replace(btrim(supplier.name), chr(8204), ''), ' ', '')) > 0
         and position('الدین' in replace(replace(btrim(supplier.name), chr(8204), ''), ' ', '')) > 0
       )
    order by
      (regexp_replace(coalesce(supplier.phone, ''), '[^0-9]', '', 'g') = '0789206027') desc,
      (select count(*) from public.supplier_transactions tx where tx.supplier_id = supplier.id) desc,
      supplier.created_at asc
    limit 1;

    if target_supplier_id is null then
      raise exception 'The customer record was found, but the matching supplier account for بهاءالدین was not found.';
    end if;

    -- Preserve every processed-goods sale, but associate it only with the
    -- supplier ledger so it no longer appears as customer activity.
    update public.sales
    set supplier_id = target_supplier_id,
        customer_id = null
    where customer_id = wrong_customer.id;

    -- The old supplier settlement already recorded the offset amount. Any
    -- remaining customer debt is the excess value now owed by the supplier.
    update public.suppliers
    set goods_settled_amount = goods_settled_amount + coalesce(wrong_customer.balance_owed, 0),
        goods_settled_amount_usd = goods_settled_amount_usd + coalesce(wrong_customer.balance_owed_usd, 0)
    where id = target_supplier_id;

    -- This removes the mirrored customer transaction history through the
    -- existing cascade. The original supplier transaction history is kept.
    delete from public.customers where id = wrong_customer.id;
  end loop;

  if exists (
    select 1
    from public.customers customer
    where regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g') = '0789206027'
       or right(customer.id, 6) = '981985'
       or (
         position('بهاء' in replace(replace(btrim(customer.name), chr(8204), ''), ' ', '')) > 0
         and position('الدین' in replace(replace(btrim(customer.name), chr(8204), ''), ' ', '')) > 0
       )
  ) then
    raise exception 'بهاءالدین is still present in the customers table after repair.';
  end if;

  update public.suppliers
  set balance_owed = greatest(total_purchased_amount - total_paid - goods_settled_amount, 0),
      receivable_balance = greatest(total_paid + goods_settled_amount - total_purchased_amount, 0),
      balance_owed_usd = greatest(total_purchased_amount_usd - total_paid_usd - goods_settled_amount_usd, 0),
      receivable_balance_usd = greatest(total_paid_usd + goods_settled_amount_usd - total_purchased_amount_usd, 0);
end;
$migration$;
