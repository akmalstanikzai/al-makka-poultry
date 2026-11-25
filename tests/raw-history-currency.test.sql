-- Run against a disposable database after the application migrations.
-- Fixtures and assertions are rolled back, including cash/account changes.
begin;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);

create function pg_temp.expect(p_condition boolean, p_message text) returns void language plpgsql as $$
begin
  if p_condition is distinct from true then raise exception 'Regression: %', p_message; end if;
end;
$$;

create function pg_temp.seed_receipt(
  p_case text, p_currency text, p_stock numeric, p_afn numeric, p_usd numeric,
  p_cash numeric default 0, p_role text default 'supplier'
) returns void language plpgsql as $$
begin
  if p_role='supplier' then
    insert into public.suppliers(id,name,total_purchased_amount,total_paid,balance_owed,
      total_purchased_amount_usd,total_paid_usd,balance_owed_usd)
    values ('test-'||p_case,'Test supplier',
      case when p_currency='AFN' then 4200 else 0 end,case when p_currency='AFN' then p_cash else 0 end,case when p_currency='AFN' then 4200-p_cash else 0 end,
      case when p_currency='USD' then 4200 else 0 end,case when p_currency='USD' then p_cash else 0 end,case when p_currency='USD' then 4200-p_cash else 0 end);
  else
    insert into public.customers(id,name) values ('test-'||p_case,'Test customer');
  end if;
  insert into public.raw_materials(id,name,category,currency,stock_kg,unit_price,average_cost_per_kg,average_cost_per_kg_usd)
  values ('test-'||p_case||'-raw','Test material','Feed',p_currency,p_stock,
    case when p_currency='AFN' then p_afn else p_usd end,p_afn,p_usd);
  if p_role='supplier' then
    insert into public.supplier_transactions(id,supplier_id,raw_material_id,date,type,description,item_name,
      currency,quantity_kg,unit_type,unit_quantity,unit_price_per_unit,amount,paid_amount,cash_amount,remaining_amount)
    values ('test-'||p_case||'-tx','test-'||p_case,'test-'||p_case||'-raw','2026-11-24','purchase','Test receipt','Test material',
      p_currency,1000,'kg',1000,4.2,4200,p_cash,p_cash,4200-p_cash);
  else
    insert into public.customer_transactions(id,customer_id,raw_material_id,date,type,description,item_name,
      currency,quantity_kg,unit_type,unit_quantity,unit_price_per_unit,amount,paid_amount,cash_amount,remaining_amount)
    values ('test-'||p_case||'-tx','test-'||p_case,'test-'||p_case||'-raw','2026-11-24','raw_goods_settlement','Test receipt','Test material',
      p_currency,1000,'kg',1000,4.2,4200,0,0,0);
  end if;
end;
$$;

create function pg_temp.correct_receipt(
  p_case text, p_currency text, p_quantity numeric default 1000, p_price numeric default 4.2,
  p_cash numeric default 0, p_destination text default null, p_role text default 'supplier'
) returns jsonb language plpgsql as $$
declare v_replacement jsonb;
begin
  v_replacement := jsonb_build_object('type',case when p_role='supplier' then 'purchase' else 'raw_goods_settlement' end,
    'date','2026-11-24','currency',p_currency,'rawMaterialId',coalesce(p_destination,'test-'||p_case||'-raw'),
    'itemName','Test material','unitType','kg','unitQuantity',p_quantity,'unitPricePerUnit',p_price,
    'paidAmount',p_cash,'description','Test corrected receipt');
  if p_role='supplier' then
    return public.correct_account_transaction_v2('supplier','test-'||p_case,'test-'||p_case||'-tx','correct',v_replacement,'Currency correction regression');
  else
    return public.correct_customer_account_transaction_v3('test-'||p_case,'test-'||p_case||'-tx','correct',v_replacement,'Currency correction regression');
  end if;
end;
$$;

do $$
declare
  v_result jsonb;
  v_cash_afn numeric;
  v_cash_usd numeric;
  v_before jsonb;
  v_after jsonb;
  v_count bigint;
begin
  -- The reported bug: currency only changes, same material id and quantity.
  perform pg_temp.seed_receipt('full','AFN',1000,4.2,0,100);
  select cash_in_hand,cash_in_hand_usd into v_cash_afn,v_cash_usd from public.factory_state where id='default';
  v_result := pg_temp.correct_receipt('full','USD',1000,4.2,100);
  perform pg_temp.expect((v_result->>'success')::boolean,'AFN to USD correction succeeds');
  perform pg_temp.expect((select stock_kg=1000 and average_cost_per_kg=0 and average_cost_per_kg_usd=4.2 and currency='AFN'
    from public.raw_materials where id='test-full-raw'),'same material retains quantity and separate value pools');
  perform pg_temp.expect((select raw_material_id='test-full-raw' and currency='USD' and amount=4200 and quantity_kg=1000
    from public.supplier_transactions where id=v_result->>'replacementTransactionId'),'replacement keeps material id and numeric values');
  perform pg_temp.expect((select status='corrected' from public.supplier_transactions where id='test-full-tx'),'original retained for audit');
  perform pg_temp.expect((select count(*)=1 from public.account_transaction_corrections where original_transaction_id='test-full-tx'),'audit entry created');
  perform pg_temp.expect((select total_purchased_amount=0 and total_purchased_amount_usd=4200 and total_paid=0 and total_paid_usd=100 and balance_owed_usd=4100
    from public.suppliers where id='test-full'),'account totals move to selected currency');
  perform pg_temp.expect((select cash_in_hand=v_cash_afn+100 and cash_in_hand_usd=v_cash_usd-100 from public.factory_state where id='default'),'cash correction stays currency-specific');

  perform pg_temp.seed_receipt('partial','AFN',400,4.2,0);
  perform pg_temp.correct_receipt('partial','USD');
  perform pg_temp.expect((select stock_kg=400 and average_cost_per_kg=0 and average_cost_per_kg_usd=4.2 from public.raw_materials where id='test-partial-raw'),'partly consumed stock is not added again');

  perform pg_temp.seed_receipt('mixed','AFN',2000,2.1,0.5);
  perform pg_temp.correct_receipt('mixed','USD');
  perform pg_temp.expect((select stock_kg=2000 and average_cost_per_kg=0 and average_cost_per_kg_usd=2.6 from public.raw_materials where id='test-mixed-raw'),'unrelated USD value is preserved');

  perform pg_temp.seed_receipt('reverse','USD',1000,0,4.2);
  perform pg_temp.correct_receipt('reverse','AFN');
  perform pg_temp.expect((select stock_kg=1000 and average_cost_per_kg=4.2 and average_cost_per_kg_usd=0 from public.raw_materials where id='test-reverse-raw'),'USD to AFN correction is symmetric');

  perform pg_temp.seed_receipt('increase','AFN',400,4.2,0);
  perform pg_temp.correct_receipt('increase','USD',1200,5);
  perform pg_temp.expect((select stock_kg=600 and average_cost_per_kg=0 and average_cost_per_kg_usd=5 from public.raw_materials where id='test-increase-raw'),'quantity increase after consumption uses net quantity');

  perform pg_temp.seed_receipt('decrease','AFN',2000,2.1,0.5);
  perform pg_temp.correct_receipt('decrease','USD',500);
  perform pg_temp.expect((select stock_kg=1500 and average_cost_per_kg=0 and abs(average_cost_per_kg_usd-(3100.0/1500))<0.000001 from public.raw_materials where id='test-decrease-raw'),'quantity reduction preserves other currency receipts');

  perform pg_temp.seed_receipt('empty','AFN',100,4.2,0);
  perform pg_temp.correct_receipt('empty','USD',100);
  perform pg_temp.expect((select stock_kg=0 and average_cost_per_kg=0 and average_cost_per_kg_usd=0 from public.raw_materials where id='test-empty-raw'),'large reduction never makes stock negative');

  perform pg_temp.seed_receipt('same','AFN',1000,4.2,0);
  perform pg_temp.correct_receipt('same','AFN',1200,5);
  perform pg_temp.expect((select stock_kg=1200 and average_cost_per_kg=5 and average_cost_per_kg_usd=0 from public.raw_materials where id='test-same-raw'),'same currency quantity and price edits still work');

  perform pg_temp.seed_receipt('move','AFN',400,4.2,0);
  insert into public.raw_materials(id,name,category,currency,stock_kg,unit_price,average_cost_per_kg,average_cost_per_kg_usd)
  values ('test-destination','Another material','Feed','AFN',100,10,10,0);
  perform pg_temp.correct_receipt('move','USD',1000,4.2,0,'test-destination');
  perform pg_temp.expect((select stock_kg=0 from public.raw_materials where id='test-move-raw'),'moving material removes only surviving stock');
  perform pg_temp.expect((select stock_kg=500 and average_cost_per_kg=2 and average_cost_per_kg_usd=3.36 from public.raw_materials where id='test-destination'),'destination accepts either receipt currency and retains its existing value');

  perform pg_temp.seed_receipt('void','AFN',400,4.2,0);
  v_result := pg_temp.correct_receipt('void','USD');
  perform public.correct_account_transaction_v2('supplier','test-void',v_result->>'replacementTransactionId','void',null,'Void regression');
  perform pg_temp.expect((select stock_kg=0 and average_cost_per_kg=0 and average_cost_per_kg_usd=0 from public.raw_materials where id='test-void-raw'),'void after currency correction removes remaining stock values');

  perform pg_temp.seed_receipt('customer','AFN',1000,4.2,0,0,'customer');
  perform pg_temp.correct_receipt('customer','USD',1000,4.2,0,null,'customer');
  perform pg_temp.expect((select stock_kg=1000 and average_cost_per_kg=0 and average_cost_per_kg_usd=4.2 from public.raw_materials where id='test-customer-raw'),'shared customer raw settlement path remains valid');

  -- Failed saves must not partially change cash, balances, inventory, or audit.
  perform pg_temp.seed_receipt('invalid','AFN',1000,4.2,0);
  select to_jsonb(rm) into v_before from public.raw_materials rm where id='test-invalid-raw';
  select count(*) into v_count from public.account_transaction_corrections;
  begin
    perform pg_temp.correct_receipt('invalid','USD',1000,4.2,0,'missing-material');
    raise exception 'Unexpected successful correction';
  exception when others then
    if sqlerrm <> 'The selected raw-material record was not found.' then raise; end if;
  end;
  select to_jsonb(rm) into v_after from public.raw_materials rm where id='test-invalid-raw';
  perform pg_temp.expect(v_before=v_after,'failed correction leaves stock unchanged');
  perform pg_temp.expect((select status='active' from public.supplier_transactions where id='test-invalid-tx'),'failed correction leaves original active');
  perform pg_temp.expect((select count(*)=v_count from public.account_transaction_corrections),'failed correction creates no audit entry');
  perform pg_temp.expect(not has_function_privilege('authenticated','public._apply_raw_stock_currency_correction(text,numeric,numeric,numeric,date)','execute'),'private helper is not directly callable');
  perform pg_temp.expect(has_function_privilege('authenticated','public.correct_account_transaction(text,text,text,text,jsonb,text)','execute'),'authenticated public correction entry point remains callable');
end;
$$;
rollback;
