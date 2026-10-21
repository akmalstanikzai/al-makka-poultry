-- Customer account entries for cash given to a customer and transport fees.
-- These are not sales or loans. They increase the customer's net obligation
-- to the factory (or reduce customer credit) and reduce cash in hand.

begin;

alter table public.customers
  add column if not exists account_charges numeric(18,2) not null default 0 check (account_charges >= 0),
  add column if not exists account_charges_usd numeric(18,2) not null default 0 check (account_charges_usd >= 0);

alter table public.customer_transactions
  drop constraint if exists customer_transactions_type_check;
alter table public.customer_transactions
  add constraint customer_transactions_type_check
  check (type in ('sale','payment','raw_goods_settlement','cash_given','transport_fee'));

create or replace function public._recalculate_account_transaction_balances(
  p_role text, p_party_id text
) returns void language plpgsql as $$
begin
  if p_role = 'supplier' then
    with current_position as (
      select 'AFN'::text currency,
             total_purchased_amount - total_paid - goods_settled_amount net
      from public.suppliers where id = p_party_id
      union all
      select 'USD', total_purchased_amount_usd - total_paid_usd - goods_settled_amount_usd
      from public.suppliers where id = p_party_id
    ), effects as (
      select st.id, st.currency, st.date,
        case st.type
          when 'purchase' then st.amount - st.cash_amount
          when 'payment' then -st.cash_amount
          when 'goods_settlement' then -st.amount
          else 0 end as effect
      from public.supplier_transactions st
      where st.supplier_id = p_party_id and st.status = 'active'
    ), running as (
      select e.id,
        cp.net - sum(e.effect) over (partition by e.currency)
          + sum(e.effect) over (partition by e.currency order by e.date, e.id) as net_after
      from effects e join current_position cp using (currency)
    )
    update public.supplier_transactions st
    set remaining_amount = greatest(r.net_after, 0),
        account_balance_after = greatest(r.net_after, 0),
        receivable_after = greatest(-r.net_after, 0)
    from running r where r.id = st.id;
  elsif p_role = 'customer' then
    with current_position as (
      select 'AFN'::text currency,
             total_purchased_amount + account_charges - total_paid - raw_settled_amount net
      from public.customers where id = p_party_id
      union all
      select 'USD', total_purchased_amount_usd + account_charges_usd - total_paid_usd - raw_settled_amount_usd
      from public.customers where id = p_party_id
    ), effects as (
      select ct.id, ct.currency, ct.date,
        case ct.type
          when 'sale' then ct.amount - ct.cash_amount
          when 'payment' then -ct.cash_amount
          when 'raw_goods_settlement' then -ct.amount
          when 'cash_given' then ct.amount
          when 'transport_fee' then ct.amount
          else 0 end as effect
      from public.customer_transactions ct
      where ct.customer_id = p_party_id and ct.status = 'active'
    ), running as (
      select e.id,
        cp.net - sum(e.effect) over (partition by e.currency)
          + sum(e.effect) over (partition by e.currency order by e.date, e.id) as net_after
      from effects e join current_position cp using (currency)
    )
    update public.customer_transactions ct
    set remaining_amount = greatest(r.net_after, 0),
        account_balance_after = greatest(r.net_after, 0)
    from running r where r.id = ct.id;
  else
    raise exception 'Invalid account role.';
  end if;
end $$;

create or replace function public._refresh_customer_account_position(p_customer_id text)
returns void language plpgsql as $$
begin
  update public.customers set
    balance_owed = greatest(0, total_purchased_amount + account_charges - total_paid - raw_settled_amount),
    credit_balance = greatest(0, total_paid + raw_settled_amount - total_purchased_amount - account_charges),
    balance_owed_usd = greatest(0, total_purchased_amount_usd + account_charges_usd - total_paid_usd - raw_settled_amount_usd),
    credit_balance_usd = greatest(0, total_paid_usd + raw_settled_amount_usd - total_purchased_amount_usd - account_charges_usd)
  where id = p_customer_id;
  perform public._recalculate_account_transaction_balances('customer', p_customer_id);
end $$;

create or replace function public.add_customer_account_entry(
  p_customer_id text,
  p_type text,
  p_amount numeric,
  p_currency text default 'AFN',
  p_date date default current_date,
  p_description text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text;
  v_balance numeric;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_type not in ('cash_given','transport_fee') then raise exception 'Invalid customer account entry type.'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Amount must be greater than zero.'; end if;
  p_currency := case when p_currency='USD' then 'USD' else 'AFN' end;

  perform 1 from public.customers where id=p_customer_id for update;
  if not found then raise exception 'Customer was not found.'; end if;

  insert into public.factory_state(id,cash_in_hand,cash_in_hand_usd,updated_at)
  values ('default',0,0,now()) on conflict (id) do nothing;
  perform 1 from public.factory_state where id='default' for update;

  if p_currency='USD' then
    update public.customers set account_charges_usd=account_charges_usd+p_amount where id=p_customer_id;
    update public.factory_state set cash_in_hand_usd=cash_in_hand_usd-p_amount,updated_at=now() where id='default';
  else
    update public.customers set account_charges=account_charges+p_amount where id=p_customer_id;
    update public.factory_state set cash_in_hand=cash_in_hand-p_amount,updated_at=now() where id='default';
  end if;

  perform public._refresh_customer_account_position(p_customer_id);
  select case when p_currency='USD' then balance_owed_usd else balance_owed end
    into v_balance from public.customers where id=p_customer_id;
  v_id := 'ct-account-' || floor(extract(epoch from clock_timestamp())*1000)::bigint::text
    || '-' || substr(md5(random()::text),1,6);

  insert into public.customer_transactions(
    id,customer_id,date,type,description,amount,paid_amount,cash_amount,
    remaining_amount,account_balance_after,currency,status
  ) values (
    v_id,p_customer_id,coalesce(p_date,current_date),p_type,
    coalesce(nullif(btrim(p_description),''),case when p_type='cash_given' then 'Cash given to customer' else 'Transport fee' end),
    round(p_amount,2),0,round(p_amount,2),v_balance,v_balance,p_currency,'active'
  );

  perform public._recalculate_account_transaction_balances('customer',p_customer_id);
  return jsonb_build_object('success',true,'transactionId',v_id);
end $$;

create or replace function public.correct_customer_account_entry(
  p_customer_id text,
  p_transaction_id text,
  p_action text,
  p_replacement jsonb default null,
  p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_old public.customer_transactions%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_new_id text;
  v_new_type text;
  v_new_amount numeric;
  v_new_currency text;
  v_new_date date;
  v_new_description text;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_action not in ('correct','void') then raise exception 'Invalid correction action.'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'A correction reason is required.'; end if;

  select * into v_old from public.customer_transactions
  where id=p_transaction_id and customer_id=p_customer_id for update;
  if not found then raise exception 'The history entry was not found.'; end if;
  if coalesce(v_old.status,'active') <> 'active' then raise exception 'Only an active history entry can be corrected or voided.'; end if;
  if v_old.type not in ('cash_given','transport_fee') then raise exception 'This is not a customer account entry.'; end if;
  v_before := to_jsonb(v_old);

  perform 1 from public.customers where id=p_customer_id for update;
  insert into public.factory_state(id,cash_in_hand,cash_in_hand_usd,updated_at)
  values ('default',0,0,now()) on conflict (id) do nothing;
  perform 1 from public.factory_state where id='default' for update;

  if v_old.currency='USD' then
    update public.customers set account_charges_usd=greatest(0,account_charges_usd-v_old.amount) where id=p_customer_id;
    update public.factory_state set cash_in_hand_usd=cash_in_hand_usd+v_old.cash_amount,updated_at=now() where id='default';
  else
    update public.customers set account_charges=greatest(0,account_charges-v_old.amount) where id=p_customer_id;
    update public.factory_state set cash_in_hand=cash_in_hand+v_old.cash_amount,updated_at=now() where id='default';
  end if;

  if p_action='correct' then
    if p_replacement is null then raise exception 'Replacement values are required.'; end if;
    v_new_type := coalesce(nullif(p_replacement->>'type',''),v_old.type);
    if v_new_type not in ('cash_given','transport_fee') then raise exception 'Invalid customer account entry type.'; end if;
    v_new_amount := coalesce(nullif(p_replacement->>'amount','')::numeric,nullif(p_replacement->>'paidAmount','')::numeric,0);
    if v_new_amount <= 0 then raise exception 'Amount must be greater than zero.'; end if;
    v_new_currency := case when p_replacement->>'currency'='USD' then 'USD' else 'AFN' end;
    v_new_date := coalesce(nullif(p_replacement->>'date','')::date,v_old.date,current_date);
    v_new_description := coalesce(nullif(btrim(p_replacement->>'description'),''),v_old.description);
    v_new_id := 'ct-account-corr-' || floor(extract(epoch from clock_timestamp())*1000)::bigint::text
      || '-' || substr(md5(random()::text),1,6);

    if v_new_currency='USD' then
      update public.customers set account_charges_usd=account_charges_usd+v_new_amount where id=p_customer_id;
      update public.factory_state set cash_in_hand_usd=cash_in_hand_usd-v_new_amount,updated_at=now() where id='default';
    else
      update public.customers set account_charges=account_charges+v_new_amount where id=p_customer_id;
      update public.factory_state set cash_in_hand=cash_in_hand-v_new_amount,updated_at=now() where id='default';
    end if;

    insert into public.customer_transactions(
      id,customer_id,date,type,description,amount,paid_amount,cash_amount,
      remaining_amount,account_balance_after,currency,status,reversal_of,correction_reason,corrected_at,corrected_by
    ) values (
      v_new_id,p_customer_id,v_new_date,v_new_type,v_new_description,round(v_new_amount,2),0,round(v_new_amount,2),
      0,0,v_new_currency,'active',p_transaction_id,p_reason,now(),auth.uid()
    );
    update public.customer_transactions set status='corrected',replaced_by_transaction_id=v_new_id,
      correction_reason=p_reason,corrected_at=now(),corrected_by=auth.uid()
    where id=p_transaction_id;
  else
    update public.customer_transactions set status='voided',correction_reason=p_reason,
      corrected_at=now(),corrected_by=auth.uid() where id=p_transaction_id;
  end if;

  perform public._refresh_customer_account_position(p_customer_id);
  if v_new_id is not null then
    select to_jsonb(ct) into v_after from public.customer_transactions ct where id=v_new_id;
  end if;
  insert into public.account_transaction_corrections(
    role,party_id,original_transaction_id,replacement_transaction_id,action,reason,before_data,after_data,changed_by
  ) values ('customer',p_customer_id,p_transaction_id,v_new_id,p_action,p_reason,v_before,v_after,auth.uid());

  return jsonb_build_object('success',true,'replacementTransactionId',v_new_id,'action',p_action);
end $$;

-- Existing sale/payment/raw-material corrections update their component totals
-- correctly, but older RPC versions do not know about account_charges when
-- calculating the final net balance. This wrapper restores the unified formula
-- after every ordinary customer-ledger correction or void.
create or replace function public.correct_customer_account_transaction_v3(
  p_customer_id text,
  p_transaction_id text,
  p_action text,
  p_replacement jsonb default null,
  p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  v_result := public.correct_account_transaction_v2(
    'customer',p_customer_id,p_transaction_id,p_action,p_replacement,p_reason
  );
  perform public._refresh_customer_account_position(p_customer_id);
  return v_result;
end $$;

update public.customers
set balance_owed=greatest(0,total_purchased_amount+account_charges-total_paid-raw_settled_amount),
    credit_balance=greatest(0,total_paid+raw_settled_amount-total_purchased_amount-account_charges),
    balance_owed_usd=greatest(0,total_purchased_amount_usd+account_charges_usd-total_paid_usd-raw_settled_amount_usd),
    credit_balance_usd=greatest(0,total_paid_usd+raw_settled_amount_usd-total_purchased_amount_usd-account_charges_usd);

revoke all on function public._refresh_customer_account_position(text) from public,anon,authenticated;
revoke all on function public.add_customer_account_entry(text,text,numeric,text,date,text) from public,anon;
revoke all on function public.correct_customer_account_entry(text,text,text,jsonb,text) from public,anon;
revoke all on function public.correct_customer_account_transaction_v3(text,text,text,jsonb,text) from public,anon;
grant execute on function public.add_customer_account_entry(text,text,numeric,text,date,text) to authenticated;
grant execute on function public.correct_customer_account_entry(text,text,text,jsonb,text) to authenticated;
grant execute on function public.correct_customer_account_transaction_v3(text,text,text,jsonb,text) to authenticated;

commit;
