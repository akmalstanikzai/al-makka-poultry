-- One factory-wide bill number namespace for every processed-stock sale,
-- including sales used to settle supplier balances. Historical rows are kept
-- nullable because they predate manual bill numbers.

begin;

alter table public.sales
  add column if not exists bill_number text;

update public.sales set bill_number=null where btrim(coalesce(bill_number,''))='';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='sales_bill_number_not_blank'
  ) then
    alter table public.sales add constraint sales_bill_number_not_blank
      check (bill_number is null or btrim(bill_number) <> '');
  end if;
end $$;

create unique index if not exists sales_bill_number_unique_idx
  on public.sales (lower(btrim(bill_number)))
  where bill_number is not null;

create or replace function public.bill_number_exists(p_bill_number text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.sales
    where bill_number is not null
      and lower(btrim(bill_number))=lower(btrim(p_bill_number))
  );
$$;

revoke all on function public.bill_number_exists(text) from public,anon;
grant execute on function public.bill_number_exists(text) to authenticated;

commit;
