-- Complete confirmed supplier cleanup without temporary or staging tables.
-- The whole repair runs inside one PostgreSQL block so it also works in SQL
-- runners that do not preserve helper relations between statements.

begin;

do $$
declare
  src record;
  registry record;
  target_id text;
  target_name text;
  audit_id bigint;
  tx record;
  replacement_id text;
  duplicate_exists boolean;
begin
  for src in
    select c.*
    from public.customers c
    where exists (
      select 1
      from public.party_role_registry r
      where r.party_role = 'supplier'
        and r.normalized_name = public.normalize_party_identity(c.name)
    )
  loop
    -- A standalone customer cash receipt has the opposite direction from a
    -- supplier payment. Keep that exceptional account for review rather than
    -- silently reversing cash. Sale rows remain safe: older builds sometimes
    -- mislabeled a non-cash supplier offset in cash_amount.
    if exists (
      select 1
      from public.customer_transactions ct
      where ct.customer_id = src.id
        and coalesce(ct.status, 'active') = 'active'
        and ct.type not in ('sale', 'raw_goods_settlement')
    ) or (
      not exists (
        select 1
        from public.customer_transactions ct
        where ct.customer_id = src.id
          and coalesce(ct.status, 'active') = 'active'
      ) and greatest(
        coalesce(src.total_purchased_amount, 0),
        coalesce(src.total_purchased_amount_usd, 0),
        coalesce(src.total_paid, 0),
        coalesce(src.total_paid_usd, 0),
        coalesce(src.raw_settled_amount, 0),
        coalesce(src.raw_settled_amount_usd, 0),
        coalesce(src.balance_owed, 0),
        coalesce(src.balance_owed_usd, 0),
        coalesce(src.credit_balance, 0),
        coalesce(src.credit_balance_usd, 0)
      ) > 0.01
    ) then
      insert into public.party_role_cleanup_audit(
        source_role, source_party_id, source_party_name, target_role,
        status, reason, before_data
      ) values (
        'customer', src.id, src.name, 'supplier', 'needs_review',
        'A manual customer cash receipt cannot be converted to an outgoing supplier payment without reversing its meaning.',
        jsonb_build_object(
          'party', to_jsonb(src),
          'transactions', coalesce((
            select jsonb_agg(to_jsonb(ct))
            from public.customer_transactions ct
            where ct.customer_id = src.id
          ), '[]'::jsonb)
        )
      );
      continue;
    end if;

    select r.* into registry
    from public.party_role_registry r
    where r.party_role = 'supplier'
      and r.normalized_name = public.normalize_party_identity(src.name)
    limit 1;

    target_id := null;
    target_name := null;

    select s.id, s.name into target_id, target_name
    from public.suppliers s
    where (registry.preferred_party_id is not null and s.id = registry.preferred_party_id)
       or public.normalize_party_identity(s.name) in (
         registry.normalized_name,
         public.normalize_party_identity(registry.canonical_name)
       )
       or exists (
         select 1
         from public.party_role_registry role_alias
         where role_alias.party_role = 'supplier'
           and role_alias.canonical_name = registry.canonical_name
           and role_alias.normalized_name = public.normalize_party_identity(s.name)
       )
       or (nullif(src.phone, '') is not null and s.phone = src.phone)
    order by
      case when s.id = registry.preferred_party_id then 0 else 1 end,
      s.created_at,
      s.id
    limit 1;

    if target_id is null then
      target_id := coalesce(
        registry.preferred_party_id,
        'sup-role-' || substr(md5(src.id || registry.canonical_name), 1, 20)
      );
      target_name := registry.canonical_name;

      insert into public.suppliers(
        id, name, phone, address,
        total_purchased_amount, total_purchased_amount_usd,
        total_paid, total_paid_usd,
        goods_settled_amount, goods_settled_amount_usd,
        balance_owed, balance_owed_usd,
        receivable_balance, receivable_balance_usd,
        created_at
      ) values (
        target_id, target_name, src.phone, src.address,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        src.created_at
      )
      on conflict (id) do nothing;
    end if;

    insert into public.party_role_cleanup_audit(
      source_role, source_party_id, source_party_name, target_role,
      target_party_id, status, reason, before_data
    ) values (
      'customer', src.id, src.name, 'supplier', target_id, 'merged',
      'Confirmed supplier moved from customer ledger; cash and stock quantities were not replayed.',
      jsonb_build_object(
        'party', to_jsonb(src),
        'transactions', coalesce((
          select jsonb_agg(to_jsonb(ct))
          from public.customer_transactions ct
          where ct.customer_id = src.id
        ), '[]'::jsonb),
        'sales', coalesce((
          select jsonb_agg(to_jsonb(sa))
          from public.sales sa
          where sa.customer_id = src.id
        ), '[]'::jsonb),
        'raw_materials', coalesce((
          select jsonb_agg(to_jsonb(rm))
          from public.raw_materials rm
          where rm.customer_id = src.id
        ), '[]'::jsonb)
      )
    ) returning id into audit_id;

    for tx in
      select ct.*
      from public.customer_transactions ct
      where ct.customer_id = src.id
        and coalesce(ct.status, 'active') = 'active'
        and ct.type in ('sale', 'raw_goods_settlement')
      order by ct.date, ct.id
    loop
      replacement_id := 'st-role-' || substr(md5(src.id || ':' || tx.id), 1, 24);

      select exists (
        select 1
        from public.supplier_transactions st
        where st.supplier_id = target_id
          and coalesce(st.status, 'active') = 'active'
          and (
            st.id = replacement_id
            or (tx.source_sale_id is not null and st.source_sale_id = tx.source_sale_id)
            or (
              tx.raw_material_id is not null
              and st.raw_material_id = tx.raw_material_id
              and st.type = case when tx.type = 'sale' then 'goods_settlement' else 'purchase' end
            )
            or regexp_replace(st.id, '^(st|ct)-', '') = regexp_replace(tx.id, '^(st|ct)-', '')
          )
      ) into duplicate_exists;

      if not duplicate_exists then
        insert into public.supplier_transactions(
          id, supplier_id, raw_material_id, product_id, source_sale_id,
          date, type, description, amount, paid_amount, cash_amount,
          remaining_amount, currency, item_name, quantity_kg, unit_price,
          unit_type, unit_quantity, unit_price_per_unit,
          account_balance_after, receivable_after, status, reversal_of,
          correction_reason, corrected_at
        ) values (
          replacement_id, target_id, tx.raw_material_id, tx.product_id,
          tx.source_sale_id, tx.date,
          case when tx.type = 'sale' then 'goods_settlement' else 'purchase' end,
          tx.description, tx.amount,
          case when tx.type = 'sale' then tx.amount else 0 end,
          0, 0, tx.currency, tx.item_name, tx.quantity_kg, tx.unit_price,
          tx.unit_type, tx.unit_quantity, tx.unit_price_per_unit,
          0, 0, 'active', tx.id,
          'Party-role cleanup audit #' || audit_id,
          now()
        );

        if tx.type = 'sale' then
          if tx.currency = 'USD' then
            update public.suppliers
            set goods_settled_amount_usd = goods_settled_amount_usd + tx.amount
            where id = target_id;
          else
            update public.suppliers
            set goods_settled_amount = goods_settled_amount + tx.amount
            where id = target_id;
          end if;
        else
          if tx.currency = 'USD' then
            update public.suppliers
            set total_purchased_amount_usd = total_purchased_amount_usd + tx.amount
            where id = target_id;
          else
            update public.suppliers
            set total_purchased_amount = total_purchased_amount + tx.amount
            where id = target_id;
          end if;
        end if;
      end if;
    end loop;

    update public.sales
    set supplier_id = target_id,
        customer_id = null,
        customer_name = target_name,
        cash_amount = 0
    where customer_id = src.id;

    update public.raw_materials
    set supplier_id = target_id,
        supplier_name = target_name,
        customer_id = null
    where customer_id = src.id;

    update public.suppliers s
    set balance_owed = greatest(0, s.total_purchased_amount - s.total_paid - s.goods_settled_amount),
        balance_owed_usd = greatest(0, s.total_purchased_amount_usd - s.total_paid_usd - s.goods_settled_amount_usd),
        receivable_balance = greatest(0, s.total_paid + s.goods_settled_amount - s.total_purchased_amount),
        receivable_balance_usd = greatest(0, s.total_paid_usd + s.goods_settled_amount_usd - s.total_purchased_amount_usd)
    where s.id = target_id;

    perform public._recalculate_account_transaction_balances('supplier', target_id);

    delete from public.customers
    where id = src.id;
  end loop;
end $$;

commit;
