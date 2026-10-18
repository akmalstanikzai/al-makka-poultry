-- Keep settlement summary columns derived from active transaction history.
-- This repairs balances after duplicate submissions are voided and prevents
-- future drift between the account header and its auditable ledger.

begin;

create or replace function public._sync_customer_raw_settlement_totals(p_customer_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_afn numeric;
  v_usd numeric;
begin
  select
    coalesce(sum(ct.amount) filter (where ct.currency = 'AFN'), 0),
    coalesce(sum(ct.amount) filter (where ct.currency = 'USD'), 0)
  into v_afn, v_usd
  from public.customer_transactions ct
  where ct.customer_id = p_customer_id
    and ct.type = 'raw_goods_settlement'
    and coalesce(ct.status, 'active') = 'active';

  update public.customers c
  set raw_settled_amount = v_afn,
      raw_settled_amount_usd = v_usd,
      balance_owed = greatest(c.total_purchased_amount - c.total_paid - v_afn, 0),
      credit_balance = greatest(c.total_paid + v_afn - c.total_purchased_amount, 0),
      balance_owed_usd = greatest(c.total_purchased_amount_usd - c.total_paid_usd - v_usd, 0),
      credit_balance_usd = greatest(c.total_paid_usd + v_usd - c.total_purchased_amount_usd, 0)
  where c.id = p_customer_id;
end;
$$;

create or replace function public._sync_supplier_goods_settlement_totals(p_supplier_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_afn numeric;
  v_usd numeric;
begin
  select
    coalesce(sum(st.amount) filter (where st.currency = 'AFN'), 0),
    coalesce(sum(st.amount) filter (where st.currency = 'USD'), 0)
  into v_afn, v_usd
  from public.supplier_transactions st
  where st.supplier_id = p_supplier_id
    and st.type = 'goods_settlement'
    and coalesce(st.status, 'active') = 'active';

  update public.suppliers s
  set goods_settled_amount = v_afn,
      goods_settled_amount_usd = v_usd,
      balance_owed = greatest(s.total_purchased_amount - s.total_paid - v_afn, 0),
      receivable_balance = greatest(s.total_paid + v_afn - s.total_purchased_amount, 0),
      balance_owed_usd = greatest(s.total_purchased_amount_usd - s.total_paid_usd - v_usd, 0),
      receivable_balance_usd = greatest(s.total_paid_usd + v_usd - s.total_purchased_amount_usd, 0)
  where s.id = p_supplier_id;
end;
$$;

create or replace function public._sync_customer_raw_settlement_totals_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.type = 'raw_goods_settlement' then
      perform public._sync_customer_raw_settlement_totals(new.customer_id);
    end if;
  elsif tg_op = 'DELETE' then
    if old.type = 'raw_goods_settlement' then
      perform public._sync_customer_raw_settlement_totals(old.customer_id);
    end if;
  else
    if old.type = 'raw_goods_settlement'
       and (new.type <> 'raw_goods_settlement' or new.customer_id is distinct from old.customer_id) then
      perform public._sync_customer_raw_settlement_totals(old.customer_id);
    end if;
    if new.type = 'raw_goods_settlement' then
      perform public._sync_customer_raw_settlement_totals(new.customer_id);
    end if;
  end if;
  return null;
end;
$$;

create or replace function public._sync_supplier_goods_settlement_totals_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.type = 'goods_settlement' then
      perform public._sync_supplier_goods_settlement_totals(new.supplier_id);
    end if;
  elsif tg_op = 'DELETE' then
    if old.type = 'goods_settlement' then
      perform public._sync_supplier_goods_settlement_totals(old.supplier_id);
    end if;
  else
    if old.type = 'goods_settlement'
       and (new.type <> 'goods_settlement' or new.supplier_id is distinct from old.supplier_id) then
      perform public._sync_supplier_goods_settlement_totals(old.supplier_id);
    end if;
    if new.type = 'goods_settlement' then
      perform public._sync_supplier_goods_settlement_totals(new.supplier_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists sync_customer_raw_settlement_totals on public.customer_transactions;
create trigger sync_customer_raw_settlement_totals
after insert or update or delete on public.customer_transactions
for each row execute function public._sync_customer_raw_settlement_totals_trigger();

drop trigger if exists sync_supplier_goods_settlement_totals on public.supplier_transactions;
create trigger sync_supplier_goods_settlement_totals
after insert or update or delete on public.supplier_transactions
for each row execute function public._sync_supplier_goods_settlement_totals_trigger();

-- Repair every existing settlement account now, including cust-12. Voided and
-- corrected rows are deliberately excluded by the synchronization functions.
do $$
declare
  v_party_id text;
begin
  for v_party_id in
    select distinct customer_id
    from public.customer_transactions
    where type = 'raw_goods_settlement'
  loop
    perform public._sync_customer_raw_settlement_totals(v_party_id);
    perform public._recalculate_account_transaction_balances('customer', v_party_id);
  end loop;

  for v_party_id in
    select distinct supplier_id
    from public.supplier_transactions
    where type = 'goods_settlement'
  loop
    perform public._sync_supplier_goods_settlement_totals(v_party_id);
    perform public._recalculate_account_transaction_balances('supplier', v_party_id);
  end loop;
end;
$$;

revoke all on function public._sync_customer_raw_settlement_totals(text) from public, anon, authenticated;
revoke all on function public._sync_supplier_goods_settlement_totals(text) from public, anon, authenticated;
revoke all on function public._sync_customer_raw_settlement_totals_trigger() from public, anon, authenticated;
revoke all on function public._sync_supplier_goods_settlement_totals_trigger() from public, anon, authenticated;

commit;
