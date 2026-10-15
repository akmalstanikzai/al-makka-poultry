-- Keep people on their real ledger. Supplier/customer settlement methods must
-- never create a mirror party on the opposite page.
--
-- This migration uses the supplier list confirmed by the factory owner. It
-- moves only ledger ownership and linked record ownership; it never changes
-- cash-in-hand or physical stock quantities. The pre-merge rows are retained
-- in party_role_cleanup_audit for traceability.

begin;

create or replace function public.normalize_party_identity(value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(
    translate(
      replace(replace(replace(btrim(coalesce(value, '')), chr(8204), ''), chr(8205), ''), chr(65279), ''),
      'يىك', 'ییک'
    ),
    '[[:space:][:punct:]]+', '', 'g'
  ));
$$;

create table if not exists public.party_role_registry (
  normalized_name text primary key,
  canonical_name text not null,
  party_role text not null check (party_role in ('supplier', 'customer')),
  preferred_party_id text,
  updated_at timestamptz not null default now()
);

alter table public.party_role_registry enable row level security;
drop policy if exists "Authenticated users have full access" on public.party_role_registry;
create policy "Authenticated users have full access"
  on public.party_role_registry for all to authenticated
  using (true) with check (true);
grant select, insert, update, delete on public.party_role_registry to authenticated;
revoke all on public.party_role_registry from anon;

create table if not exists public.party_role_cleanup_audit (
  id bigint generated always as identity primary key,
  source_role text not null check (source_role in ('supplier', 'customer')),
  source_party_id text not null,
  source_party_name text not null,
  target_role text not null check (target_role in ('supplier', 'customer')),
  target_party_id text,
  status text not null check (status in ('merged', 'needs_review')),
  reason text not null,
  before_data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.party_role_cleanup_audit enable row level security;
drop policy if exists "Authenticated users have read access" on public.party_role_cleanup_audit;
create policy "Authenticated users have read access"
  on public.party_role_cleanup_audit for select to authenticated using (true);
grant select on public.party_role_cleanup_audit to authenticated;
revoke all on public.party_role_cleanup_audit from anon;

insert into public.party_role_registry(normalized_name, canonical_name, party_role, preferred_party_id)
values
  (public.normalize_party_identity('بهاوالدین'), 'بهاوالدین', 'supplier', null),
  (public.normalize_party_identity('بهاءالدین'), 'بهاوالدین', 'supplier', null),
  (public.normalize_party_identity('بهاؤالدین'), 'بهاوالدین', 'supplier', null),
  (public.normalize_party_identity('حاجی مومن'), 'حاجی مومن', 'supplier', null),
  (public.normalize_party_identity('واحد الله قریشی'), 'واحد الله قریشی', 'supplier', null),
  (public.normalize_party_identity('کابل سن فلور'), 'کابل سن فلور', 'supplier', null),
  (public.normalize_party_identity('ابراهیم خان'), 'ابراهیم خان', 'supplier', null),
  (public.normalize_party_identity('احسان A اخوت میل'), 'احسان A اخوت میل', 'supplier', null),
  (public.normalize_party_identity('بصیر ذغال'), 'بصیر ذغال', 'supplier', null),
  (public.normalize_party_identity('عبدالله هوتک'), 'عبدالله هوتک', 'supplier', null),
  (public.normalize_party_identity('سبحان الله حاجی'), 'سبحان الله حاجی', 'supplier', null),
  (public.normalize_party_identity('هدایت بتی کوت'), 'هدایت بتی کوت', 'supplier', null),
  (public.normalize_party_identity('ناصر رحمان'), 'ناصر رحمان', 'supplier', null),
  (public.normalize_party_identity('په نعدو'), 'په نعدو', 'supplier', 'sup-1791972528935')
on conflict (normalized_name) do update
set canonical_name = excluded.canonical_name,
    party_role = excluded.party_role,
    preferred_party_id = excluded.preferred_party_id,
    updated_at = now();

-- Supplier names found on the customer page are old processed-goods mirrors.
do $$
declare
  src record;
  registry record;
  target_id text;
  target_name text;
  audit_id bigint;
  opening_purchase_afn numeric;
  opening_purchase_usd numeric;
  opening_paid_afn numeric;
  opening_paid_usd numeric;
  opening_goods_afn numeric;
  opening_goods_usd numeric;
begin
  for src in
    select c.*
    from public.customers c
    where exists (
      select 1 from public.party_role_registry r
      where r.party_role = 'supplier'
        and r.normalized_name = public.normalize_party_identity(c.name)
    )
  loop
    select r.* into registry from public.party_role_registry r
    where r.normalized_name = public.normalize_party_identity(src.name)
    limit 1;

    if exists (
      select 1 from public.customer_transactions ct
      where ct.customer_id = src.id and coalesce(ct.status, 'active') = 'active'
        and ct.type not in ('sale', 'raw_goods_settlement')
    ) or (
      not exists (
        select 1 from public.customer_transactions ct
        where ct.customer_id = src.id and coalesce(ct.status, 'active') = 'active'
      ) and greatest(
        coalesce(src.total_purchased_amount, 0), coalesce(src.total_purchased_amount_usd, 0),
        coalesce(src.total_paid, 0), coalesce(src.total_paid_usd, 0),
        coalesce(src.raw_settled_amount, 0), coalesce(src.raw_settled_amount_usd, 0),
        coalesce(src.balance_owed, 0), coalesce(src.balance_owed_usd, 0),
        coalesce(src.credit_balance, 0), coalesce(src.credit_balance_usd, 0)
      ) > 0.01
    ) then
      insert into public.party_role_cleanup_audit(
        source_role, source_party_id, source_party_name, target_role, status, reason, before_data
      ) values (
        'customer', src.id, src.name, 'supplier', 'needs_review',
        'A manual customer payment requires review because its direction cannot be safely converted to a supplier payment.',
        jsonb_build_object(
          'party', to_jsonb(src),
          'transactions', coalesce((select jsonb_agg(to_jsonb(ct)) from public.customer_transactions ct where ct.customer_id = src.id), '[]'::jsonb)
        )
      );
      continue;
    end if;

    select s.id, s.name into target_id, target_name
    from public.suppliers s
    where (registry.preferred_party_id is not null and s.id = registry.preferred_party_id)
       or public.normalize_party_identity(s.name) in (
         registry.normalized_name,
         public.normalize_party_identity(registry.canonical_name)
       )
       or exists (
         select 1 from public.party_role_registry role_alias
         where role_alias.party_role = 'supplier'
           and role_alias.canonical_name = registry.canonical_name
           and role_alias.normalized_name = public.normalize_party_identity(s.name)
       )
       or (nullif(src.phone, '') is not null and s.phone = src.phone)
    order by case when s.id = registry.preferred_party_id then 0 else 1 end, s.created_at, s.id
    limit 1;

    if target_id is null then
      target_id := coalesce(registry.preferred_party_id, 'sup-role-' || substr(md5(src.id || registry.canonical_name), 1, 20));
      target_name := registry.canonical_name;
      insert into public.suppliers(
        id, name, phone, address, total_purchased_amount, total_purchased_amount_usd,
        total_paid, total_paid_usd, goods_settled_amount, goods_settled_amount_usd,
        balance_owed, balance_owed_usd, receivable_balance, receivable_balance_usd, created_at
      ) values (
        target_id, target_name, src.phone, src.address, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, src.created_at
      ) on conflict (id) do nothing;
    end if;

    insert into public.party_role_cleanup_audit(
      source_role, source_party_id, source_party_name, target_role, target_party_id,
      status, reason, before_data
    ) values (
      'customer', src.id, src.name, 'supplier', target_id, 'merged',
      'Canonical supplier moved off the customer page without changing cash or stock quantity.',
      jsonb_build_object(
        'party', to_jsonb(src),
        'transactions', coalesce((select jsonb_agg(to_jsonb(ct)) from public.customer_transactions ct where ct.customer_id = src.id), '[]'::jsonb),
        'sales', coalesce((select jsonb_agg(to_jsonb(sa)) from public.sales sa where sa.customer_id = src.id), '[]'::jsonb),
        'raw_materials', coalesce((select jsonb_agg(to_jsonb(rm)) from public.raw_materials rm where rm.customer_id = src.id), '[]'::jsonb)
      )
    ) returning id into audit_id;

    select
      s.total_purchased_amount - coalesce(sum(st.amount) filter (where st.type = 'purchase' and st.currency = 'AFN' and coalesce(st.status, 'active') = 'active'), 0),
      s.total_purchased_amount_usd - coalesce(sum(st.amount) filter (where st.type = 'purchase' and st.currency = 'USD' and coalesce(st.status, 'active') = 'active'), 0),
      s.total_paid - coalesce(sum(st.cash_amount) filter (where st.type in ('purchase', 'payment') and st.currency = 'AFN' and coalesce(st.status, 'active') = 'active'), 0),
      s.total_paid_usd - coalesce(sum(st.cash_amount) filter (where st.type in ('purchase', 'payment') and st.currency = 'USD' and coalesce(st.status, 'active') = 'active'), 0),
      s.goods_settled_amount - coalesce(sum(st.amount) filter (where st.type = 'goods_settlement' and st.currency = 'AFN' and coalesce(st.status, 'active') = 'active'), 0),
      s.goods_settled_amount_usd - coalesce(sum(st.amount) filter (where st.type = 'goods_settlement' and st.currency = 'USD' and coalesce(st.status, 'active') = 'active'), 0)
    into opening_purchase_afn, opening_purchase_usd, opening_paid_afn, opening_paid_usd, opening_goods_afn, opening_goods_usd
    from public.suppliers s
    left join public.supplier_transactions st on st.supplier_id = s.id
    where s.id = target_id
    group by s.id;

    insert into public.supplier_transactions(
      id, supplier_id, raw_material_id, product_id, source_sale_id, date, type,
      description, amount, paid_amount, cash_amount, remaining_amount, currency,
      item_name, quantity_kg, unit_price, unit_type, unit_quantity,
      unit_price_per_unit, account_balance_after, receivable_after, status,
      reversal_of, correction_reason, corrected_at
    )
    select
      'st-role-' || substr(md5(src.id || ':' || ct.id), 1, 24), target_id,
      ct.raw_material_id, ct.product_id, ct.source_sale_id, ct.date,
      case when ct.type = 'sale' then 'goods_settlement' else 'purchase' end,
      ct.description, ct.amount,
      case when ct.type = 'sale' then ct.amount else 0 end,
      0, 0, ct.currency, ct.item_name, ct.quantity_kg, ct.unit_price,
      ct.unit_type, ct.unit_quantity, ct.unit_price_per_unit, 0, 0, 'active',
      ct.id, 'Party-role cleanup audit #' || audit_id, now()
    from public.customer_transactions ct
    where ct.customer_id = src.id
      and coalesce(ct.status, 'active') = 'active'
      and ct.type in ('sale', 'raw_goods_settlement')
      and not exists (
        select 1 from public.supplier_transactions st
        where st.supplier_id = target_id
          and coalesce(st.status, 'active') = 'active'
          and (
            st.id = 'st-role-' || substr(md5(src.id || ':' || ct.id), 1, 24)
            or (ct.source_sale_id is not null and st.source_sale_id = ct.source_sale_id)
            or (ct.raw_material_id is not null and st.raw_material_id = ct.raw_material_id
                and st.type = case when ct.type = 'sale' then 'goods_settlement' else 'purchase' end)
            or regexp_replace(st.id, '^(st|ct)-', '') = regexp_replace(ct.id, '^(st|ct)-', '')
          )
      );

    update public.sales
    set supplier_id = target_id, customer_id = null,
        customer_name = target_name
    where customer_id = src.id;

    update public.raw_materials
    set supplier_id = target_id, supplier_name = target_name, customer_id = null
    where customer_id = src.id;

    update public.suppliers s
    set total_purchased_amount = greatest(0, opening_purchase_afn + coalesce((select sum(st.amount) from public.supplier_transactions st where st.supplier_id = target_id and st.type = 'purchase' and st.currency = 'AFN' and coalesce(st.status, 'active') = 'active'), 0)),
        total_purchased_amount_usd = greatest(0, opening_purchase_usd + coalesce((select sum(st.amount) from public.supplier_transactions st where st.supplier_id = target_id and st.type = 'purchase' and st.currency = 'USD' and coalesce(st.status, 'active') = 'active'), 0)),
        total_paid = greatest(0, opening_paid_afn + coalesce((select sum(st.cash_amount) from public.supplier_transactions st where st.supplier_id = target_id and st.type in ('purchase', 'payment') and st.currency = 'AFN' and coalesce(st.status, 'active') = 'active'), 0)),
        total_paid_usd = greatest(0, opening_paid_usd + coalesce((select sum(st.cash_amount) from public.supplier_transactions st where st.supplier_id = target_id and st.type in ('purchase', 'payment') and st.currency = 'USD' and coalesce(st.status, 'active') = 'active'), 0)),
        goods_settled_amount = greatest(0, opening_goods_afn + coalesce((select sum(st.amount) from public.supplier_transactions st where st.supplier_id = target_id and st.type = 'goods_settlement' and st.currency = 'AFN' and coalesce(st.status, 'active') = 'active'), 0)),
        goods_settled_amount_usd = greatest(0, opening_goods_usd + coalesce((select sum(st.amount) from public.supplier_transactions st where st.supplier_id = target_id and st.type = 'goods_settlement' and st.currency = 'USD' and coalesce(st.status, 'active') = 'active'), 0))
    where s.id = target_id;

    update public.suppliers s
    set balance_owed = greatest(0, s.total_purchased_amount - s.total_paid - s.goods_settled_amount),
        balance_owed_usd = greatest(0, s.total_purchased_amount_usd - s.total_paid_usd - s.goods_settled_amount_usd),
        receivable_balance = greatest(0, s.total_paid + s.goods_settled_amount - s.total_purchased_amount),
        receivable_balance_usd = greatest(0, s.total_paid_usd + s.goods_settled_amount_usd - s.total_purchased_amount_usd)
    where s.id = target_id;

    perform public._recalculate_account_transaction_balances('supplier', target_id);
    delete from public.customers where id = src.id;
  end loop;
end $$;

-- Any account left on the supplier page that is not in the confirmed supplier
-- list belongs to the customer ledger. Only non-cash settlement mirrors can be
-- moved automatically; cash-bearing rows are retained and flagged for review.
do $$
declare
  src record;
  target_id text;
  audit_id bigint;
  opening_sales_afn numeric;
  opening_sales_usd numeric;
  opening_paid_afn numeric;
  opening_paid_usd numeric;
  opening_raw_afn numeric;
  opening_raw_usd numeric;
begin
  for src in
    select s.* from public.suppliers s
    where not exists (
      select 1 from public.party_role_registry r
      where r.party_role = 'supplier'
        and r.normalized_name = public.normalize_party_identity(s.name)
    )
  loop
    if exists (
      select 1 from public.supplier_transactions st
      where st.supplier_id = src.id and coalesce(st.status, 'active') = 'active'
        and (st.type = 'payment' or (st.type = 'purchase' and coalesce(st.cash_amount, 0) > 0))
    ) or (
      not exists (
        select 1 from public.supplier_transactions st
        where st.supplier_id = src.id and coalesce(st.status, 'active') = 'active'
      ) and greatest(
        coalesce(src.total_purchased_amount, 0), coalesce(src.total_purchased_amount_usd, 0),
        coalesce(src.total_paid, 0), coalesce(src.total_paid_usd, 0),
        coalesce(src.goods_settled_amount, 0), coalesce(src.goods_settled_amount_usd, 0),
        coalesce(src.balance_owed, 0), coalesce(src.balance_owed_usd, 0),
        coalesce(src.receivable_balance, 0), coalesce(src.receivable_balance_usd, 0)
      ) > 0.01
    ) then
      insert into public.party_role_cleanup_audit(
        source_role, source_party_id, source_party_name, target_role, status, reason, before_data
      ) values (
        'supplier', src.id, src.name, 'customer', 'needs_review',
        'Cash-bearing supplier transaction requires human review before changing ledger role.',
        jsonb_build_object(
          'party', to_jsonb(src),
          'transactions', coalesce((select jsonb_agg(to_jsonb(st)) from public.supplier_transactions st where st.supplier_id = src.id), '[]'::jsonb)
        )
      );
      continue;
    end if;

    select c.id into target_id from public.customers c
    where public.normalize_party_identity(c.name) = public.normalize_party_identity(src.name)
       or (nullif(src.phone, '') is not null and c.phone = src.phone)
    order by c.created_at, c.id limit 1;

    if target_id is null then
      target_id := 'cust-role-' || substr(md5(src.id || src.name), 1, 20);
      insert into public.customers(
        id, name, phone, address, total_purchased_amount, total_purchased_amount_usd,
        total_paid, total_paid_usd, raw_settled_amount, raw_settled_amount_usd,
        balance_owed, balance_owed_usd, credit_balance, credit_balance_usd, created_at
      ) values (
        target_id, src.name, src.phone, src.address, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, src.created_at
      );
    end if;

    insert into public.party_role_cleanup_audit(
      source_role, source_party_id, source_party_name, target_role, target_party_id,
      status, reason, before_data
    ) values (
      'supplier', src.id, src.name, 'customer', target_id, 'merged',
      'Canonical customer moved off the supplier page without changing cash or stock quantity.',
      jsonb_build_object(
        'party', to_jsonb(src),
        'transactions', coalesce((select jsonb_agg(to_jsonb(st)) from public.supplier_transactions st where st.supplier_id = src.id), '[]'::jsonb),
        'sales', coalesce((select jsonb_agg(to_jsonb(sa)) from public.sales sa where sa.supplier_id = src.id), '[]'::jsonb),
        'raw_materials', coalesce((select jsonb_agg(to_jsonb(rm)) from public.raw_materials rm where rm.supplier_id = src.id), '[]'::jsonb)
      )
    ) returning id into audit_id;

    select
      c.total_purchased_amount - coalesce(sum(ct.amount) filter (where ct.type = 'sale' and ct.currency = 'AFN' and coalesce(ct.status, 'active') = 'active'), 0),
      c.total_purchased_amount_usd - coalesce(sum(ct.amount) filter (where ct.type = 'sale' and ct.currency = 'USD' and coalesce(ct.status, 'active') = 'active'), 0),
      c.total_paid - coalesce(sum(ct.cash_amount) filter (where ct.type in ('sale', 'payment') and ct.currency = 'AFN' and coalesce(ct.status, 'active') = 'active'), 0),
      c.total_paid_usd - coalesce(sum(ct.cash_amount) filter (where ct.type in ('sale', 'payment') and ct.currency = 'USD' and coalesce(ct.status, 'active') = 'active'), 0),
      c.raw_settled_amount - coalesce(sum(ct.amount) filter (where ct.type = 'raw_goods_settlement' and ct.currency = 'AFN' and coalesce(ct.status, 'active') = 'active'), 0),
      c.raw_settled_amount_usd - coalesce(sum(ct.amount) filter (where ct.type = 'raw_goods_settlement' and ct.currency = 'USD' and coalesce(ct.status, 'active') = 'active'), 0)
    into opening_sales_afn, opening_sales_usd, opening_paid_afn, opening_paid_usd, opening_raw_afn, opening_raw_usd
    from public.customers c
    left join public.customer_transactions ct on ct.customer_id = c.id
    where c.id = target_id
    group by c.id;

    insert into public.customer_transactions(
      id, customer_id, raw_material_id, product_id, source_sale_id, date, type,
      description, amount, paid_amount, cash_amount, remaining_amount, currency,
      item_name, quantity_kg, unit_price, unit_type, unit_quantity,
      unit_price_per_unit, account_balance_after, status, reversal_of,
      correction_reason, corrected_at
    )
    select
      'ct-role-' || substr(md5(src.id || ':' || st.id), 1, 24), target_id,
      st.raw_material_id, st.product_id, st.source_sale_id, st.date,
      case when st.type in ('purchase', 'customer_raw_settlement') then 'raw_goods_settlement' else 'sale' end,
      st.description, st.amount, 0,
      0, 0, st.currency, st.item_name, st.quantity_kg, st.unit_price,
      st.unit_type, st.unit_quantity, st.unit_price_per_unit, 0, 'active',
      st.id, 'Party-role cleanup audit #' || audit_id, now()
    from public.supplier_transactions st
    where st.supplier_id = src.id
      and coalesce(st.status, 'active') = 'active'
      and st.type in ('purchase', 'customer_raw_settlement', 'goods_settlement')
      and not exists (
        select 1 from public.customer_transactions ct
        where ct.customer_id = target_id
          and coalesce(ct.status, 'active') = 'active'
          and (
            ct.id = 'ct-role-' || substr(md5(src.id || ':' || st.id), 1, 24)
            or (st.source_sale_id is not null and ct.source_sale_id = st.source_sale_id)
            or (st.raw_material_id is not null and ct.raw_material_id = st.raw_material_id
                and ct.type = case when st.type in ('purchase', 'customer_raw_settlement') then 'raw_goods_settlement' else 'sale' end)
            or regexp_replace(ct.id, '^(st|ct)-', '') = regexp_replace(st.id, '^(st|ct)-', '')
          )
      );

    update public.sales
    set customer_id = target_id, supplier_id = null,
        customer_name = src.name, customer_phone = coalesce(nullif(customer_phone, ''), src.phone),
        paid_amount = 0, cash_amount = 0, remaining_amount = total_amount
    where supplier_id = src.id;

    update public.raw_materials
    set customer_id = target_id, supplier_id = null, supplier_name = null
    where supplier_id = src.id;

    update public.customers c
    set total_purchased_amount = greatest(0, opening_sales_afn + coalesce((select sum(ct.amount) from public.customer_transactions ct where ct.customer_id = target_id and ct.type = 'sale' and ct.currency = 'AFN' and coalesce(ct.status, 'active') = 'active'), 0)),
        total_purchased_amount_usd = greatest(0, opening_sales_usd + coalesce((select sum(ct.amount) from public.customer_transactions ct where ct.customer_id = target_id and ct.type = 'sale' and ct.currency = 'USD' and coalesce(ct.status, 'active') = 'active'), 0)),
        total_paid = greatest(0, opening_paid_afn + coalesce((select sum(ct.cash_amount) from public.customer_transactions ct where ct.customer_id = target_id and ct.type in ('sale', 'payment') and ct.currency = 'AFN' and coalesce(ct.status, 'active') = 'active'), 0)),
        total_paid_usd = greatest(0, opening_paid_usd + coalesce((select sum(ct.cash_amount) from public.customer_transactions ct where ct.customer_id = target_id and ct.type in ('sale', 'payment') and ct.currency = 'USD' and coalesce(ct.status, 'active') = 'active'), 0)),
        raw_settled_amount = greatest(0, opening_raw_afn + coalesce((select sum(ct.amount) from public.customer_transactions ct where ct.customer_id = target_id and ct.type = 'raw_goods_settlement' and ct.currency = 'AFN' and coalesce(ct.status, 'active') = 'active'), 0)),
        raw_settled_amount_usd = greatest(0, opening_raw_usd + coalesce((select sum(ct.amount) from public.customer_transactions ct where ct.customer_id = target_id and ct.type = 'raw_goods_settlement' and ct.currency = 'USD' and coalesce(ct.status, 'active') = 'active'), 0))
    where c.id = target_id;

    update public.customers c
    set balance_owed = greatest(0, c.total_purchased_amount - c.total_paid - c.raw_settled_amount),
        balance_owed_usd = greatest(0, c.total_purchased_amount_usd - c.total_paid_usd - c.raw_settled_amount_usd),
        credit_balance = greatest(0, c.total_paid + c.raw_settled_amount - c.total_purchased_amount),
        credit_balance_usd = greatest(0, c.total_paid_usd + c.raw_settled_amount_usd - c.total_purchased_amount_usd)
    where c.id = target_id;

    perform public._recalculate_account_transaction_balances('customer', target_id);
    delete from public.suppliers where id = src.id;
  end loop;
end $$;

-- Prevent a future app version or stale browser session from recreating the
-- same cross-ledger identity. New names remain allowed; only known conflicts
-- are rejected.
create or replace function public.enforce_party_role_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Whole-state synchronization may upsert unchanged profiles. Let those
  -- harmless updates pass, including a record intentionally left for review.
  if tg_op = 'UPDATE'
     and public.normalize_party_identity(old.name) = public.normalize_party_identity(new.name) then
    return new;
  end if;
  if tg_table_name = 'customers' then
    if exists (
      select 1 from public.party_role_registry r
      where r.party_role = 'supplier'
        and r.normalized_name = public.normalize_party_identity(new.name)
    ) or exists (
      select 1 from public.suppliers s
      where public.normalize_party_identity(s.name) = public.normalize_party_identity(new.name)
    ) then
      raise exception 'This person is registered as a supplier. Use supplier goods settlement.';
    end if;
  elsif tg_table_name = 'suppliers' then
    if exists (
      select 1 from public.customers c
      where public.normalize_party_identity(c.name) = public.normalize_party_identity(new.name)
    ) and not exists (
      select 1 from public.party_role_registry r
      where r.party_role = 'supplier'
        and r.normalized_name = public.normalize_party_identity(new.name)
    ) then
      raise exception 'This person is registered as a customer. Use customer raw-material settlement.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists enforce_customer_role_identity on public.customers;
create trigger enforce_customer_role_identity
before insert or update of name on public.customers
for each row execute function public.enforce_party_role_identity();

drop trigger if exists enforce_supplier_role_identity on public.suppliers;
create trigger enforce_supplier_role_identity
before insert or update of name on public.suppliers
for each row execute function public.enforce_party_role_identity();

commit;
