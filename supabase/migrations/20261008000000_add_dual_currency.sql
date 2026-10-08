-- Add explicit currency metadata without converting or combining values.
-- Existing rows are AFN for backward compatibility.
alter table public.raw_materials add column if not exists currency text not null default 'AFN' check (currency in ('AFN','USD'));
alter table public.supplier_transactions add column if not exists currency text not null default 'AFN' check (currency in ('AFN','USD'));
alter table public.customer_transactions add column if not exists currency text not null default 'AFN' check (currency in ('AFN','USD'));
alter table public.sales add column if not exists currency text not null default 'AFN' check (currency in ('AFN','USD'));
alter table public.expenses add column if not exists currency text not null default 'AFN' check (currency in ('AFN','USD'));
alter table public.production_batches add column if not exists currency text not null default 'AFN' check (currency in ('AFN','USD'));
alter table public.processed_stock add column if not exists currency text not null default 'AFN' check (currency in ('AFN','USD'));
alter table public.factory_state add column if not exists cash_in_hand_usd numeric(18,2) not null default 0;
alter table public.suppliers add column if not exists total_purchased_amount_usd numeric(18,2) not null default 0;
alter table public.suppliers add column if not exists total_paid_usd numeric(18,2) not null default 0;
alter table public.suppliers add column if not exists balance_owed_usd numeric(18,2) not null default 0;
alter table public.customers add column if not exists total_purchased_amount_usd numeric(18,2) not null default 0;
alter table public.customers add column if not exists total_paid_usd numeric(18,2) not null default 0;
alter table public.customers add column if not exists balance_owed_usd numeric(18,2) not null default 0;

alter table public.processed_stock add column if not exists average_cost_per_kg_usd numeric(18,4) not null default 0;
alter table public.production_batches add column if not exists cost_per_kg_usd numeric(18,4) not null default 0;
alter table public.production_batches add column if not exists total_cost_usd numeric(18,2) not null default 0;
alter table public.sales add column if not exists total_cost_of_goods_usd numeric(18,2) not null default 0;
alter table public.sales add column if not exists profit_usd numeric(18,2) not null default 0;
