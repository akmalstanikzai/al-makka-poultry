-- Preserve material selection when correcting receipt currency. No existing
-- records are rewritten by this migration; changes happen only on an explicit
-- Reverse-and-Replace/Void action, with the existing audit/account/cash logic.
begin;

create or replace function public._apply_raw_stock_currency_correction(
  p_id text, p_quantity_delta numeric, p_afn_delta numeric, p_usd_delta numeric, p_date date
) returns void language plpgsql set search_path = public as $$
declare
  v_material public.raw_materials%rowtype;
  v_quantity numeric;
  v_afn numeric;
  v_usd numeric;
begin
  select * into v_material from public.raw_materials where id=p_id for update;
  if not found then raise exception 'The linked raw-material record was not found.'; end if;
  v_quantity := v_material.stock_kg+p_quantity_delta;
  if v_quantity < 0 then raise exception 'The correction would make raw stock negative.'; end if;
  v_afn := greatest(0, v_material.stock_kg*v_material.average_cost_per_kg+p_afn_delta);
  v_usd := greatest(0, v_material.stock_kg*v_material.average_cost_per_kg_usd+p_usd_delta);
  update public.raw_materials set
    stock_kg=v_quantity,
    average_cost_per_kg=case when v_quantity>0 then v_afn/v_quantity else 0 end,
    average_cost_per_kg_usd=case when v_quantity>0 then v_usd/v_quantity else 0 end,
    unit_price=case when v_quantity<=0 then 0 when currency='USD' then v_usd/v_quantity else v_afn/v_quantity end,
    date_added=coalesce(p_date,date_added)
  where id=p_id;
end;
$$;

revoke all on function public._apply_raw_stock_currency_correction(text,numeric,numeric,numeric,date)
  from public, anon, authenticated;

create or replace function public.correct_account_transaction(
  p_role text,
  p_party_id text,
  p_transaction_id text,
  p_action text,
  p_replacement jsonb default null,
  p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new_id text;
  v_new_row jsonb;
  v_type text;
  v_old_currency text;
  v_new_currency text;
  v_old_amount numeric;
  v_new_amount numeric := 0;
  v_old_cash numeric;
  v_new_cash numeric := 0;
  v_old_quantity numeric;
  v_new_quantity numeric := 0;
  v_old_raw_id text;
  v_new_raw_id text;
  v_old_product_id text;
  v_new_product_id text;
  v_old_material public.raw_materials%rowtype;
  v_new_material public.raw_materials%rowtype;
  v_delta_afn numeric;
  v_delta_usd numeric;
  v_remaining_quantity numeric;
  v_extra_quantity numeric;
  v_transfer_quantity numeric;
  v_quantity_delta numeric;
  v_source_sale_id text;
  v_new_date date;
  v_description text;
  v_item_name text;
  v_unit_type text;
  v_unit_quantity numeric;
  v_unit_price numeric;
  v_final_net numeric;
  v_debt_before numeric;
  v_paid_display numeric;
  v_cost_afn numeric := 0;
  v_cost_usd numeric := 0;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_role not in ('supplier', 'customer') then raise exception 'Invalid account role.'; end if;
  if p_action not in ('correct', 'void') then raise exception 'Invalid correction action.'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'A correction reason is required.'; end if;

  if p_role = 'supplier' then
    select to_jsonb(st) into v_old from public.supplier_transactions st
    where st.id = p_transaction_id and st.supplier_id = p_party_id for update;
  else
    select to_jsonb(ct) into v_old from public.customer_transactions ct
    where ct.id = p_transaction_id and ct.customer_id = p_party_id for update;
  end if;
  if v_old is null then raise exception 'The history entry was not found.'; end if;
  if coalesce(v_old->>'status', 'active') <> 'active' then
    raise exception 'Only an active history entry can be corrected or voided.';
  end if;

  v_type := v_old->>'type';
  if (p_role = 'supplier' and v_type not in ('purchase','payment','goods_settlement'))
     or (p_role = 'customer' and v_type not in ('sale','payment','raw_goods_settlement')) then
    raise exception 'This legacy transaction type cannot be corrected from this account.';
  end if;
  v_old_currency := coalesce(v_old->>'currency', 'AFN');
  v_old_amount := coalesce((v_old->>'amount')::numeric, 0);
  v_old_cash := coalesce((v_old->>'cash_amount')::numeric, 0);
  v_old_quantity := coalesce((v_old->>'quantity_kg')::numeric, 0);
  v_old_raw_id := nullif(v_old->>'raw_material_id', '');
  v_old_product_id := nullif(v_old->>'product_id', '');
  v_source_sale_id := nullif(v_old->>'source_sale_id', '');

  -- Older transactions can point at an inventory id that was deleted and
  -- recreated. Recover the link from the immutable transaction item name.
  -- Currency and party ownership are preferences rather than requirements,
  -- because legacy rows sometimes used the wrong currency or shared stock.
  if v_type in ('purchase', 'raw_goods_settlement')
     and (
       v_old_raw_id is null
       or not exists (
         select 1 from public.raw_materials linked
         where linked.id = v_old_raw_id
       )
     )
     and btrim(coalesce(v_old->>'item_name', '')) <> '' then
    select rm.id into v_old_raw_id
    from public.raw_materials rm
    where public.normalize_party_identity(rm.name)
      = public.normalize_party_identity(v_old->>'item_name')
    order by
      case when rm.currency = v_old_currency then 1 else 0 end desc,
      case
        when p_role = 'customer' and rm.customer_id = p_party_id then 1
        when p_role = 'supplier' and rm.supplier_id = p_party_id then 1
        else 0
      end desc,
      rm.date_added desc,
      rm.id
    limit 1;

    if v_old_raw_id is not null then
      if p_role = 'customer' then
        update public.customer_transactions
        set raw_material_id = v_old_raw_id
        where id = p_transaction_id and customer_id = p_party_id;
      else
        update public.supplier_transactions
        set raw_material_id = v_old_raw_id
        where id = p_transaction_id and supplier_id = p_party_id;
      end if;
    end if;
  end if;

  if p_action = 'correct' then
    if p_replacement is null then raise exception 'Replacement values are required.'; end if;
    v_new_currency := case when p_replacement->>'currency' = 'USD' then 'USD' else 'AFN' end;
    v_new_date := coalesce(nullif(p_replacement->>'date', '')::date, current_date);
    v_description := btrim(coalesce(p_replacement->>'description', v_old->>'description', ''));
    v_unit_type := case when p_replacement->>'unitType' in ('kg','bag','ton') then p_replacement->>'unitType' else coalesce(v_old->>'unit_type', 'kg') end;
    v_unit_quantity := greatest(coalesce(nullif(p_replacement->>'unitQuantity','')::numeric, 0), 0);
    v_unit_price := greatest(coalesce(nullif(p_replacement->>'unitPricePerUnit','')::numeric, 0), 0);
    if v_type = 'payment' then
      v_new_amount := 0;
      v_new_cash := greatest(coalesce(nullif(p_replacement->>'paidAmount','')::numeric, 0), 0);
      v_new_quantity := 0;
      v_item_name := null;
    else
      if v_unit_quantity <= 0 or v_unit_price < 0 then raise exception 'Quantity must be positive and price cannot be negative.'; end if;
      v_new_quantity := v_unit_quantity * case v_unit_type when 'ton' then 1000 when 'bag' then 50 else 1 end;
      v_new_amount := round(v_unit_quantity * v_unit_price, 2);
      v_new_cash := case when v_type in ('purchase','sale')
        then least(v_new_amount, greatest(coalesce(nullif(p_replacement->>'paidAmount','')::numeric, 0), 0)) else 0 end;
      v_item_name := nullif(btrim(coalesce(p_replacement->>'itemName', '')), '');
    end if;
    v_new_raw_id := coalesce(nullif(p_replacement->>'rawMaterialId',''), v_old_raw_id);
    v_new_product_id := coalesce(nullif(p_replacement->>'productId',''), v_old_product_id);
  else
    v_new_currency := v_old_currency;
  end if;

  -- Raw stock has independent AFN/USD value pools. Its legacy currency is
  -- metadata, not a restriction on the currencies of its receipts.
  if v_type in ('purchase', 'raw_goods_settlement') then
    -- Lock both rows consistently before reading values or changing stock.
    perform 1 from public.raw_materials
    where id in (v_old_raw_id, v_new_raw_id) order by id for update;
    select * into v_old_material from public.raw_materials where id = v_old_raw_id;
    if p_action = 'correct' then
      select * into v_new_material from public.raw_materials where id = v_new_raw_id;
      if not found then raise exception 'The selected raw-material record was not found.'; end if;

      if v_old_material.id is null then
        perform public._apply_raw_stock_currency_correction(
          v_new_raw_id, v_new_quantity,
          case when v_new_currency='AFN' then v_new_amount else 0 end,
          case when v_new_currency='USD' then v_new_amount else 0 end, v_new_date);
      elsif v_old_raw_id = v_new_raw_id then
        -- Correct only the surviving original stock, plus the quantity delta.
        -- Never reinterpret the old AFN amount as USD (or vice versa).
        v_quantity_delta := greatest(v_new_quantity-v_old_quantity, -v_old_material.stock_kg);
        v_transfer_quantity := least(v_old_quantity, v_old_material.stock_kg);
        v_remaining_quantity := greatest(0, v_transfer_quantity+v_quantity_delta);
        v_extra_quantity := least(0, v_transfer_quantity+v_quantity_delta);
        v_delta_afn := v_remaining_quantity * case when v_new_currency='AFN' then v_new_amount/v_new_quantity else 0 end
          - v_transfer_quantity * case when v_old_currency='AFN' and v_old_quantity>0 then v_old_amount/v_old_quantity else 0 end;
        v_delta_usd := v_remaining_quantity * case when v_new_currency='USD' then v_new_amount/v_new_quantity else 0 end
          - v_transfer_quantity * case when v_old_currency='USD' and v_old_quantity>0 then v_old_amount/v_old_quantity else 0 end;
        -- If the reduction exceeds this receipt's surviving quantity, remove
        -- the excess proportionately from the other stock's independent pools.
        if v_extra_quantity < 0 and v_old_material.stock_kg > v_transfer_quantity then
          v_delta_afn := v_delta_afn + v_extra_quantity * greatest(0,
            v_old_material.stock_kg*v_old_material.average_cost_per_kg
            - v_transfer_quantity*case when v_old_currency='AFN' and v_old_quantity>0 then v_old_amount/v_old_quantity else 0 end
          ) / (v_old_material.stock_kg-v_transfer_quantity);
          v_delta_usd := v_delta_usd + v_extra_quantity * greatest(0,
            v_old_material.stock_kg*v_old_material.average_cost_per_kg_usd
            - v_transfer_quantity*case when v_old_currency='USD' and v_old_quantity>0 then v_old_amount/v_old_quantity else 0 end
          ) / (v_old_material.stock_kg-v_transfer_quantity);
        end if;
        perform public._apply_raw_stock_currency_correction(
          v_new_raw_id, v_quantity_delta, v_delta_afn, v_delta_usd, v_new_date);
      else
        -- Moving to another material transfers at most the stock still on hand.
        v_transfer_quantity := least(v_old_quantity, v_old_material.stock_kg);
        if v_transfer_quantity > 0 then
          perform public._apply_raw_stock_currency_correction(
            v_old_raw_id, -v_transfer_quantity,
            -v_transfer_quantity*v_old_material.average_cost_per_kg,
            -v_transfer_quantity*v_old_material.average_cost_per_kg_usd, (v_old->>'date')::date);
        end if;
        v_quantity_delta := greatest(v_transfer_quantity+v_new_quantity-v_old_quantity, -v_new_material.stock_kg);
        v_delta_afn := v_quantity_delta * case when v_quantity_delta > 0
          then case when v_new_currency='AFN' then v_new_amount/v_new_quantity else 0 end
          else v_new_material.average_cost_per_kg end;
        v_delta_usd := v_quantity_delta * case when v_quantity_delta > 0
          then case when v_new_currency='USD' then v_new_amount/v_new_quantity else 0 end
          else v_new_material.average_cost_per_kg_usd end;
        perform public._apply_raw_stock_currency_correction(
          v_new_raw_id, v_quantity_delta, v_delta_afn, v_delta_usd, v_new_date);
      end if;
    elsif v_old_material.id is not null then
      v_transfer_quantity := least(v_old_quantity, v_old_material.stock_kg);
      if v_transfer_quantity > 0 then
        perform public._apply_raw_stock_currency_correction(
          v_old_raw_id, -v_transfer_quantity,
          -v_transfer_quantity*v_old_material.average_cost_per_kg,
          -v_transfer_quantity*v_old_material.average_cost_per_kg_usd, (v_old->>'date')::date);
      end if;
    end if;
  elsif v_type in ('sale', 'goods_settlement') then
    if p_action = 'correct' and v_old_product_id = v_new_product_id then
      perform public._apply_processed_stock_correction(v_old_product_id, v_old_quantity - v_new_quantity, v_new_date);
    else
      perform public._apply_processed_stock_correction(v_old_product_id, v_old_quantity, (v_old->>'date')::date);
      if p_action = 'correct' then
        perform public._apply_processed_stock_correction(v_new_product_id, -v_new_quantity, v_new_date);
      end if;
    end if;
    if p_action = 'correct' then
      select name, average_cost_per_kg, average_cost_per_kg_usd
      into v_item_name, v_cost_afn, v_cost_usd
      from public.processed_stock where id = v_new_product_id;
    end if;
  end if;

  if p_role = 'supplier' then
    update public.suppliers set
      total_purchased_amount = greatest(0, total_purchased_amount
        - case when v_old_currency='AFN' and v_type='purchase' then v_old_amount else 0 end
        + case when p_action='correct' and v_new_currency='AFN' and v_type='purchase' then v_new_amount else 0 end),
      total_purchased_amount_usd = greatest(0, total_purchased_amount_usd
        - case when v_old_currency='USD' and v_type='purchase' then v_old_amount else 0 end
        + case when p_action='correct' and v_new_currency='USD' and v_type='purchase' then v_new_amount else 0 end),
      total_paid = greatest(0, total_paid
        - case when v_old_currency='AFN' and v_type in ('purchase','payment') then v_old_cash else 0 end
        + case when p_action='correct' and v_new_currency='AFN' and v_type in ('purchase','payment') then v_new_cash else 0 end),
      total_paid_usd = greatest(0, total_paid_usd
        - case when v_old_currency='USD' and v_type in ('purchase','payment') then v_old_cash else 0 end
        + case when p_action='correct' and v_new_currency='USD' and v_type in ('purchase','payment') then v_new_cash else 0 end),
      goods_settled_amount = greatest(0, goods_settled_amount
        - case when v_old_currency='AFN' and v_type='goods_settlement' then v_old_amount else 0 end
        + case when p_action='correct' and v_new_currency='AFN' and v_type='goods_settlement' then v_new_amount else 0 end),
      goods_settled_amount_usd = greatest(0, goods_settled_amount_usd
        - case when v_old_currency='USD' and v_type='goods_settlement' then v_old_amount else 0 end
        + case when p_action='correct' and v_new_currency='USD' and v_type='goods_settlement' then v_new_amount else 0 end)
    where id = p_party_id;
    if not found then raise exception 'Supplier was not found.'; end if;
    update public.suppliers set
      balance_owed = greatest(total_purchased_amount-total_paid-goods_settled_amount,0),
      receivable_balance = greatest(total_paid+goods_settled_amount-total_purchased_amount,0),
      balance_owed_usd = greatest(total_purchased_amount_usd-total_paid_usd-goods_settled_amount_usd,0),
      receivable_balance_usd = greatest(total_paid_usd+goods_settled_amount_usd-total_purchased_amount_usd,0)
    where id = p_party_id;
  else
    update public.customers set
      total_purchased_amount = greatest(0, total_purchased_amount
        - case when v_old_currency='AFN' and v_type='sale' then v_old_amount else 0 end
        + case when p_action='correct' and v_new_currency='AFN' and v_type='sale' then v_new_amount else 0 end),
      total_purchased_amount_usd = greatest(0, total_purchased_amount_usd
        - case when v_old_currency='USD' and v_type='sale' then v_old_amount else 0 end
        + case when p_action='correct' and v_new_currency='USD' and v_type='sale' then v_new_amount else 0 end),
      total_paid = greatest(0, total_paid
        - case when v_old_currency='AFN' and v_type in ('sale','payment') then v_old_cash else 0 end
        + case when p_action='correct' and v_new_currency='AFN' and v_type in ('sale','payment') then v_new_cash else 0 end),
      total_paid_usd = greatest(0, total_paid_usd
        - case when v_old_currency='USD' and v_type in ('sale','payment') then v_old_cash else 0 end
        + case when p_action='correct' and v_new_currency='USD' and v_type in ('sale','payment') then v_new_cash else 0 end),
      raw_settled_amount = greatest(0, raw_settled_amount
        - case when v_old_currency='AFN' and v_type='raw_goods_settlement' then v_old_amount else 0 end
        + case when p_action='correct' and v_new_currency='AFN' and v_type='raw_goods_settlement' then v_new_amount else 0 end),
      raw_settled_amount_usd = greatest(0, raw_settled_amount_usd
        - case when v_old_currency='USD' and v_type='raw_goods_settlement' then v_old_amount else 0 end
        + case when p_action='correct' and v_new_currency='USD' and v_type='raw_goods_settlement' then v_new_amount else 0 end)
    where id = p_party_id;
    if not found then raise exception 'Customer was not found.'; end if;
    update public.customers set
      balance_owed = greatest(total_purchased_amount-total_paid-raw_settled_amount,0),
      credit_balance = greatest(total_paid+raw_settled_amount-total_purchased_amount,0),
      balance_owed_usd = greatest(total_purchased_amount_usd-total_paid_usd-raw_settled_amount_usd,0),
      credit_balance_usd = greatest(total_paid_usd+raw_settled_amount_usd-total_purchased_amount_usd,0)
    where id = p_party_id;
  end if;

  -- Reverse old cash and apply replacement cash.
  insert into public.factory_state(id, cash_in_hand, cash_in_hand_usd)
  values ('default', 0, 0) on conflict (id) do nothing;
  update public.factory_state set
    cash_in_hand = cash_in_hand
      + case when v_old_currency='AFN' and p_role='supplier' and v_type in ('purchase','payment') then v_old_cash
             when v_old_currency='AFN' and p_role='customer' and v_type in ('sale','payment') then -v_old_cash else 0 end
      + case when p_action='correct' and v_new_currency='AFN' and p_role='supplier' and v_type in ('purchase','payment') then -v_new_cash
             when p_action='correct' and v_new_currency='AFN' and p_role='customer' and v_type in ('sale','payment') then v_new_cash else 0 end,
    cash_in_hand_usd = cash_in_hand_usd
      + case when v_old_currency='USD' and p_role='supplier' and v_type in ('purchase','payment') then v_old_cash
             when v_old_currency='USD' and p_role='customer' and v_type in ('sale','payment') then -v_old_cash else 0 end
      + case when p_action='correct' and v_new_currency='USD' and p_role='supplier' and v_type in ('purchase','payment') then -v_new_cash
             when p_action='correct' and v_new_currency='USD' and p_role='customer' and v_type in ('sale','payment') then v_new_cash else 0 end,
    updated_at = now()
  where id = 'default';

  if p_action = 'correct' then
    v_new_id := case when p_role='supplier' then 'st-corr-' else 'ct-corr-' end
      || floor(extract(epoch from clock_timestamp())*1000)::bigint::text || '-' || substr(md5(random()::text),1,6);

    if p_role='supplier' then
      select case when v_new_currency='USD'
        then total_purchased_amount_usd-total_paid_usd-goods_settled_amount_usd
        else total_purchased_amount-total_paid-goods_settled_amount end
      into v_final_net from public.suppliers where id=p_party_id;
    else
      select case when v_new_currency='USD'
        then total_purchased_amount_usd-total_paid_usd-raw_settled_amount_usd
        else total_purchased_amount-total_paid-raw_settled_amount end
      into v_final_net from public.customers where id=p_party_id;
    end if;
    v_debt_before := case
      when v_type in ('goods_settlement','raw_goods_settlement') then greatest(v_final_net + v_new_amount,0)
      when v_type='sale' then greatest(v_final_net - v_new_amount + v_new_cash,0)
      else greatest(v_final_net,0) end;
    v_paid_display := case
      when v_type in ('goods_settlement','raw_goods_settlement') then least(v_new_amount,v_debt_before)
      when v_type='sale' then v_new_cash + least(greatest(- (v_final_net-v_new_amount+v_new_cash),0), greatest(v_new_amount-v_new_cash,0))
      when v_type in ('purchase','payment') then v_new_cash
      else v_new_cash end;

    if p_role='supplier' then
      insert into public.supplier_transactions(
        id,supplier_id,raw_material_id,product_id,source_sale_id,date,type,description,
        item_name,quantity_kg,unit_price,unit_type,unit_quantity,unit_price_per_unit,
        amount,paid_amount,cash_amount,remaining_amount,account_balance_after,receivable_after,
        currency,status,reversal_of,correction_reason,corrected_at,corrected_by
      ) values (
        v_new_id,p_party_id,v_new_raw_id,v_new_product_id,v_source_sale_id,v_new_date,v_type,v_description,
        v_item_name,v_new_quantity,case when v_new_quantity>0 then v_new_amount/v_new_quantity else null end,
        case when v_type='payment' then null else v_unit_type end,
        case when v_type='payment' then null else v_unit_quantity end,
        case when v_type='payment' then null else v_unit_price end,
        v_new_amount,v_paid_display,v_new_cash,greatest(v_final_net,0),greatest(v_final_net,0),greatest(-v_final_net,0),
        v_new_currency,'active',p_transaction_id,p_reason,now(),auth.uid()
      );
      update public.supplier_transactions set status='corrected',replaced_by_transaction_id=v_new_id,
        correction_reason=p_reason,corrected_at=now(),corrected_by=auth.uid()
      where id=p_transaction_id;
      select to_jsonb(st) into v_new_row from public.supplier_transactions st where st.id=v_new_id;
    else
      insert into public.customer_transactions(
        id,customer_id,raw_material_id,product_id,source_sale_id,date,type,description,
        item_name,quantity_kg,unit_price,unit_type,unit_quantity,unit_price_per_unit,
        amount,paid_amount,cash_amount,remaining_amount,account_balance_after,
        currency,status,reversal_of,correction_reason,corrected_at,corrected_by
      ) values (
        v_new_id,p_party_id,v_new_raw_id,v_new_product_id,v_source_sale_id,v_new_date,v_type,v_description,
        v_item_name,v_new_quantity,case when v_new_quantity>0 then v_new_amount/v_new_quantity else null end,
        case when v_type='payment' then null else v_unit_type end,
        case when v_type='payment' then null else v_unit_quantity end,
        case when v_type='payment' then null else v_unit_price end,
        v_new_amount,v_paid_display,v_new_cash,greatest(v_final_net,0),greatest(v_final_net,0),
        v_new_currency,'active',p_transaction_id,p_reason,now(),auth.uid()
      );
      update public.customer_transactions set status='corrected',replaced_by_transaction_id=v_new_id,
        correction_reason=p_reason,corrected_at=now(),corrected_by=auth.uid()
      where id=p_transaction_id;
      select to_jsonb(ct) into v_new_row from public.customer_transactions ct where ct.id=v_new_id;
    end if;

    if v_source_sale_id is not null and v_type in ('sale','goods_settlement') then
      update public.sales set
        date=v_new_date, product_id=v_new_product_id, product_name=v_item_name,
        unit_type=v_unit_type, unit_quantity=v_unit_quantity, quantity_kg=v_new_quantity,
        sale_price_per_unit=v_unit_price, total_amount=v_new_amount,
        paid_amount=v_paid_display, cash_amount=v_new_cash,
        remaining_amount=greatest(v_new_amount-v_paid_display,0),
        total_cost_of_goods=v_cost_afn*v_new_quantity,
        total_cost_of_goods_usd=v_cost_usd*v_new_quantity,
        profit=(case when v_new_currency='AFN' then v_new_amount else 0 end)-(v_cost_afn*v_new_quantity),
        profit_usd=(case when v_new_currency='USD' then v_new_amount else 0 end)-(v_cost_usd*v_new_quantity),
        currency=v_new_currency, status='active', correction_reason=p_reason,
        corrected_at=now(), corrected_by=auth.uid()
      where id=v_source_sale_id;
    end if;
  else
    if p_role='supplier' then
      update public.supplier_transactions set status='voided',correction_reason=p_reason,
        corrected_at=now(),corrected_by=auth.uid() where id=p_transaction_id;
    else
      update public.customer_transactions set status='voided',correction_reason=p_reason,
        corrected_at=now(),corrected_by=auth.uid() where id=p_transaction_id;
    end if;
    if v_source_sale_id is not null and v_type in ('sale','goods_settlement') then
      update public.sales set status='voided',correction_reason=p_reason,
        corrected_at=now(),corrected_by=auth.uid() where id=v_source_sale_id;
    end if;
  end if;

  perform public._recalculate_account_transaction_balances(p_role,p_party_id);
  insert into public.account_transaction_corrections(
    role,party_id,original_transaction_id,replacement_transaction_id,action,reason,
    before_data,after_data,changed_by
  ) values (p_role,p_party_id,p_transaction_id,v_new_id,p_action,p_reason,v_old,v_new_row,auth.uid());

  return jsonb_build_object('success',true,'replacementTransactionId',v_new_id,'action',p_action);
end $$;

revoke all on function public._apply_raw_stock_correction(text,numeric,numeric,date) from public, anon, authenticated;
revoke all on function public._apply_processed_stock_correction(text,numeric,date) from public, anon, authenticated;
revoke all on function public._recalculate_account_transaction_balances(text,text) from public, anon, authenticated;
revoke all on function public.correct_account_transaction(text,text,text,text,jsonb,text) from public, anon;
grant execute on function public.correct_account_transaction(text,text,text,text,jsonb,text) to authenticated;


commit;
