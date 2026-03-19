-- Master Raw Items table
create table if not exists public.master_items (
  id            bigserial primary key,
  item_code     text not null unique,
  item_name     text not null,
  wh_sku        text,
  storage       text,
  wh_description text,
  unit          text,
  category      text,
  status        text default 'Active',
  price_per_cs  numeric,
  qty_per_cs    numeric,
  supplier      text,
  correct_price numeric,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.master_items disable row level security;
grant all on public.master_items to anon, authenticated;
grant usage, select on sequence public.master_items_id_seq to anon, authenticated;

-- Auto-update updated_at
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists master_items_updated_at on public.master_items;
create trigger master_items_updated_at
  before update on public.master_items
  for each row execute function public.update_updated_at();
