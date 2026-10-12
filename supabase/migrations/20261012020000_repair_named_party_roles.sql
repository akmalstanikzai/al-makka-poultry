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
  -- These are repeated here so this repair also works when the preceding
  -- cleanup migration was only partially executed in the SQL Editor.
  alter table public.suppliers
    add column if not exists receivable_balance numeric(18,2) not null default 0 check (receivable_balance >= 0),
    add column if not exists receivable_balance_usd numeric(18,2) not null default 0 check (receivable_balance_usd >= 0);

  alter table public.supplier_transactions
    add column if not exists receivable_after numeric(18,2) not null default 0 check (receivable_after >= 0);

  alter table public.sales
    add column if not exists supplier_id text references public.suppliers(id) on update cascade on delete set null;

  create index if not exists sales_supplier_id_idx on public.sales(supplier_id);

  -- بهاءالدین and سبحان الله حاجی are suppliers. Their customer rows were
  -- mirrors created by processed-goods settlements. The correct supplier
  -- transactions already exist because both sides were written together.
  for wrong_customer in
    select customer.*
    from public.customers customer
    where regexp_replace(replace(btrim(customer.name), chr(8204), ''), '\s+', ' ', 'g') = any (array[
      'بهاءالدین', 'بهاء الدین', 'بهاؤالدین',
      'سبحان الله حاجی', 'سبحان الله حاجي'
    ])
  loop
    target_supplier_id := null;
    select supplier.id
      into target_supplier_id
    from public.suppliers supplier
    where regexp_replace(replace(btrim(supplier.name), chr(8204), ''), '\s+', ' ', 'g') =
            regexp_replace(replace(btrim(wrong_customer.name), chr(8204), ''), '\s+', ' ', 'g')
       or (nullif(btrim(wrong_customer.phone), '') is not null and supplier.phone = wrong_customer.phone)
    order by
      (regexp_replace(replace(btrim(supplier.name), chr(8204), ''), '\s+', ' ', 'g') =
       regexp_replace(replace(btrim(wrong_customer.name), chr(8204), ''), '\s+', ' ', 'g')) desc,
      (select count(*) from public.supplier_transactions tx where tx.supplier_id = supplier.id) desc,
      supplier.created_at asc
    limit 1;

    if target_supplier_id is null then
      raise exception 'Cannot repair customer "%": matching supplier account was not found.', wrong_customer.name;
    end if;

    -- Keep the sale record, but attach it to the supplier instead of the
    -- customer page.
    update public.sales
    set supplier_id = target_supplier_id,
        customer_id = null
    where customer_id = wrong_customer.id;

    -- Older code already counted the debt-offset portion on the supplier.
    -- Only a remaining customer debt represented an uncounted excess.
    update public.suppliers
    set goods_settled_amount = goods_settled_amount + coalesce(wrong_customer.balance_owed, 0),
        goods_settled_amount_usd = goods_settled_amount_usd + coalesce(wrong_customer.balance_owed_usd, 0)
    where id = target_supplier_id;

    -- Cascading removes only the mirrored customer transactions. The original
    -- supplier settlement history remains on the supplier account.
    delete from public.customers where id = wrong_customer.id;
  end loop;

  -- حضرت علی is a customer. The supplier row was a mirror created when raw
  -- material was received from that customer.
  for wrong_supplier in
    select supplier.*
    from public.suppliers supplier
    where regexp_replace(replace(btrim(supplier.name), chr(8204), ''), '\s+', ' ', 'g') = any (array[
      'حضرت علی', 'حضرت علي'
    ])
  loop
    target_customer_id := null;
    select customer.id
      into target_customer_id
    from public.customers customer
    where regexp_replace(replace(btrim(customer.name), chr(8204), ''), '\s+', ' ', 'g') =
            regexp_replace(replace(btrim(wrong_supplier.name), chr(8204), ''), '\s+', ' ', 'g')
       or (nullif(btrim(wrong_supplier.phone), '') is not null and customer.phone = wrong_supplier.phone)
    order by
      (regexp_replace(replace(btrim(customer.name), chr(8204), ''), '\s+', ' ', 'g') =
       regexp_replace(replace(btrim(wrong_supplier.name), chr(8204), ''), '\s+', ' ', 'g')) desc,
      (select count(*) from public.customer_transactions tx where tx.customer_id = customer.id) desc,
      customer.created_at asc
    limit 1;

    if target_customer_id is null then
      raise exception 'Cannot repair supplier "%": matching customer account was not found.', wrong_supplier.name;
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

    -- Remove the mirrored supplier totals. The matching raw-goods transaction
    -- and value already remain on the correct customer account.
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

    if exists (select 1 from public.supplier_transactions tx where tx.supplier_id = wrong_supplier.id) then
      raise exception 'Cannot safely remove supplier "%": it also has genuine supplier transactions that need manual classification.', wrong_supplier.name;
    end if;

    delete from public.suppliers where id = wrong_supplier.id;
  end loop;

  -- Fail clearly instead of reporting success when a spelling variation was
  -- not matched and one of the known misplaced records remains.
  if exists (
    select 1 from public.customers customer
    where regexp_replace(replace(btrim(customer.name), chr(8204), ''), '\s+', ' ', 'g') = any (array[
      'بهاءالدین', 'بهاء الدین', 'بهاؤالدین',
      'سبحان الله حاجی', 'سبحان الله حاجي'
    ])
  ) then
    raise exception 'One or more named supplier records are still present on the Customers page.';
  end if;

  if exists (
    select 1 from public.suppliers supplier
    where regexp_replace(replace(btrim(supplier.name), chr(8204), ''), '\s+', ' ', 'g') = any (array[
      'حضرت علی', 'حضرت علي'
    ])
  ) then
    raise exception 'حضرت علی is still present on the Suppliers page.';
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
