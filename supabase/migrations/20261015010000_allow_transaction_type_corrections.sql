-- Extend auditable corrections so the replacement may use another valid
-- transaction type on the same party ledger. The existing correction RPC is
-- reused for each reversal/application, keeping the complete operation atomic.

create or replace function public.correct_account_transaction_v2(
  p_role text,
  p_party_id text,
  p_transaction_id text,
  p_action text,
  p_replacement jsonb default null,
  p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_old_type text;
  v_new_type text;
  v_dummy_id text;
  v_replacement_id text;
  v_source_sale_id text;
  v_result jsonb;
  v_date date;
  v_currency text;
  v_unit_type text;
  v_unit_quantity numeric;
  v_unit_price numeric;
  v_quantity_kg numeric;
  v_amount numeric;
  v_product_id text;
  v_product_name text;
  v_customer_name text;
  v_customer_phone text;
  v_cost_afn numeric := 0;
  v_cost_usd numeric := 0;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_role not in ('supplier','customer') then raise exception 'Invalid account role.'; end if;
  if p_action not in ('correct','void') then raise exception 'Invalid correction action.'; end if;

  if p_role = 'supplier' then
    select to_jsonb(st) into v_before from public.supplier_transactions st
    where st.id=p_transaction_id and st.supplier_id=p_party_id for update;
  else
    select to_jsonb(ct) into v_before from public.customer_transactions ct
    where ct.id=p_transaction_id and ct.customer_id=p_party_id for update;
  end if;
  if v_before is null then raise exception 'The history entry was not found.'; end if;

  v_old_type := v_before->>'type';
  v_new_type := coalesce(nullif(p_replacement->>'type',''),v_old_type);

  if p_action='void' or v_new_type=v_old_type then
    return public.correct_account_transaction(p_role,p_party_id,p_transaction_id,p_action,p_replacement,p_reason);
  end if;
  if (p_role='supplier' and v_new_type not in ('purchase','payment','goods_settlement'))
     or (p_role='customer' and v_new_type not in ('sale','payment','raw_goods_settlement')) then
    raise exception 'The selected transaction type is not valid for this account.';
  end if;
  if coalesce(v_before->>'status','active') <> 'active' then
    raise exception 'Only an active history entry can be corrected.';
  end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'A correction reason is required.'; end if;

  -- First reverse the real original. If any later statement fails, PostgreSQL
  -- rolls this call back too, so no partial correction can be committed.
  perform public.correct_account_transaction(
    p_role,p_party_id,p_transaction_id,'void',null,p_reason
  );

  v_date := coalesce(nullif(p_replacement->>'date','')::date,current_date);
  v_currency := case when p_replacement->>'currency'='USD' then 'USD' else 'AFN' end;
  v_unit_type := case when p_replacement->>'unitType' in ('kg','bag','ton') then p_replacement->>'unitType' else 'kg' end;
  v_unit_quantity := greatest(coalesce(nullif(p_replacement->>'unitQuantity','')::numeric,0),0);
  v_unit_price := greatest(coalesce(nullif(p_replacement->>'unitPricePerUnit','')::numeric,0),0);
  v_quantity_kg := v_unit_quantity * case v_unit_type when 'ton' then 1000 when 'bag' then 50 else 1 end;
  v_amount := round(v_unit_quantity*v_unit_price,2);
  v_product_id := nullif(p_replacement->>'productId','');
  v_dummy_id := case when p_role='supplier' then 'st-internal-' else 'ct-internal-' end
    || floor(extract(epoch from clock_timestamp())*1000)::bigint::text || '-' || substr(md5(random()::text),1,6);

  -- A purchase/payment changed into a sale-like transaction has no linked sale
  -- yet. Create its sales-ledger row now; the normal correction RPC fills the
  -- final calculated values and keeps it linked to the replacement transaction.
  if v_new_type in ('sale','goods_settlement') then
    if v_unit_quantity <= 0 or v_product_id is null then
      raise exception 'Select processed stock and enter a positive quantity.';
    end if;
    select name,average_cost_per_kg,average_cost_per_kg_usd
      into v_product_name,v_cost_afn,v_cost_usd
    from public.processed_stock where id=v_product_id;
    if not found then raise exception 'The selected processed-stock record was not found.'; end if;
    if p_role='customer' then
      select name,phone into v_customer_name,v_customer_phone
      from public.customers where id=p_party_id;
    else
      select name,phone into v_customer_name,v_customer_phone
      from public.suppliers where id=p_party_id;
    end if;
    v_source_sale_id := 'sale-corr-' || floor(extract(epoch from clock_timestamp())*1000)::bigint::text || '-' || substr(md5(random()::text),1,6);
    insert into public.sales(
      id,date,product_id,product_name,customer_id,supplier_id,customer_name,customer_phone,
      unit_type,unit_quantity,quantity_kg,sale_price_per_unit,total_amount,paid_amount,cash_amount,
      remaining_amount,total_cost_of_goods,total_cost_of_goods_usd,profit,profit_usd,notes,currency,status
    ) values (
      v_source_sale_id,v_date,v_product_id,v_product_name,
      case when p_role='customer' then p_party_id else null end,
      case when p_role='supplier' then p_party_id else null end,
      v_customer_name,v_customer_phone,v_unit_type,v_unit_quantity,v_quantity_kg,v_unit_price,v_amount,0,0,
      v_amount,v_cost_afn*v_quantity_kg,v_cost_usd*v_quantity_kg,
      (case when v_currency='AFN' then v_amount else 0 end)-(v_cost_afn*v_quantity_kg),
      (case when v_currency='USD' then v_amount else 0 end)-(v_cost_usd*v_quantity_kg),
      null,v_currency,'active'
    );
  end if;

  -- The zero-value internal row lets the established correction function apply
  -- all effects for the new type without duplicating accounting logic.
  if p_role='supplier' then
    insert into public.supplier_transactions(
      id,supplier_id,raw_material_id,product_id,source_sale_id,date,type,description,
      amount,paid_amount,cash_amount,remaining_amount,account_balance_after,receivable_after,currency,status
    ) values (
      v_dummy_id,p_party_id,nullif(p_replacement->>'rawMaterialId',''),v_product_id,v_source_sale_id,
      v_date,v_new_type,'Internal correction bridge',0,0,0,0,0,0,v_currency,'active'
    );
  else
    insert into public.customer_transactions(
      id,customer_id,raw_material_id,product_id,source_sale_id,date,type,description,
      amount,paid_amount,cash_amount,remaining_amount,account_balance_after,currency,status
    ) values (
      v_dummy_id,p_party_id,nullif(p_replacement->>'rawMaterialId',''),v_product_id,v_source_sale_id,
      v_date,v_new_type,'Internal correction bridge',0,0,0,0,0,v_currency,'active'
    );
  end if;

  v_result := public.correct_account_transaction(
    p_role,p_party_id,v_dummy_id,'correct',p_replacement,p_reason
  );
  v_replacement_id := v_result->>'replacementTransactionId';
  if v_replacement_id is null then raise exception 'The replacement transaction was not created.'; end if;

  if p_role='supplier' then
    update public.supplier_transactions set reversal_of=p_transaction_id where id=v_replacement_id;
    select to_jsonb(st) into v_after from public.supplier_transactions st where st.id=v_replacement_id;
    delete from public.supplier_transactions where id=v_dummy_id;
    update public.supplier_transactions set status='corrected',replaced_by_transaction_id=v_replacement_id,
      correction_reason=p_reason,corrected_at=now(),corrected_by=auth.uid()
    where id=p_transaction_id;
  else
    update public.customer_transactions set reversal_of=p_transaction_id where id=v_replacement_id;
    select to_jsonb(ct) into v_after from public.customer_transactions ct where ct.id=v_replacement_id;
    delete from public.customer_transactions where id=v_dummy_id;
    update public.customer_transactions set status='corrected',replaced_by_transaction_id=v_replacement_id,
      correction_reason=p_reason,corrected_at=now(),corrected_by=auth.uid()
    where id=p_transaction_id;
  end if;

  delete from public.account_transaction_corrections
  where role=p_role and party_id=p_party_id
    and original_transaction_id in (p_transaction_id,v_dummy_id);
  insert into public.account_transaction_corrections(
    role,party_id,original_transaction_id,replacement_transaction_id,action,reason,
    before_data,after_data,changed_by
  ) values (
    p_role,p_party_id,p_transaction_id,v_replacement_id,'correct',p_reason,
    v_before,v_after,auth.uid()
  );

  return jsonb_build_object('success',true,'replacementTransactionId',v_replacement_id,'action','correct');
end $$;

revoke all on function public.correct_account_transaction_v2(text,text,text,text,jsonb,text) from public,anon;
grant execute on function public.correct_account_transaction_v2(text,text,text,text,jsonb,text) to authenticated;

