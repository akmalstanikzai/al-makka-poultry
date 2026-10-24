begin;

alter table public.counter_sales
  add column if not exists audit_trail jsonb not null default '[]'::jsonb
    check (jsonb_typeof(audit_trail) = 'array');

alter table public.counter_customer_transactions
  add column if not exists status text not null default 'active'
    check (status in ('active','voided'));

alter table public.counter_customer_transactions
  drop constraint if exists counter_customer_transactions_type_check;
alter table public.counter_customer_transactions
  add constraint counter_customer_transactions_type_check
  check (type in ('sale','payment','adjustment'));

comment on column public.counter_sales.audit_trail is
  'Immutable snapshots recorded before each counter-sale edit or void.';

commit;
