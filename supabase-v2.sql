-- ============================================================
-- DataLens V2 — Full Restaurant Analytics Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. PROFILES (keep existing, just ensure it exists)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'viewer' check (role in ('super_admin','admin','sub_admin','viewer')),
  created_at timestamptz default now()
);

-- Grant permissions
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
alter table public.profiles disable row level security;

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''), 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. HOURLY SALES
-- ============================================================
create table if not exists public.hourly_sales (
  id              bigserial primary key,
  restaurant_name text not null,
  date            date not null,
  hour            text,
  no_of_tickets   int,
  covers          int,
  charges         numeric,
  subtotal        numeric,
  discount        numeric,
  net_sales       numeric,
  gross_sales     numeric,
  apt             numeric,
  uploaded_by     uuid references auth.users(id),
  uploaded_at     timestamptz default now()
);
alter table public.hourly_sales disable row level security;
grant all on public.hourly_sales to anon, authenticated;

-- ============================================================
-- 3. DELIVERY SALES
-- ============================================================
create table if not exists public.delivery_sales (
  id              bigserial primary key,
  restaurant_name text not null,
  date            date not null,
  hour            text,
  platform        text,
  number_of_bills int,
  covers          int,
  charges         numeric,
  subtotal        numeric,
  discount        numeric,
  net_sales       numeric,
  gross_sales     numeric,
  apt             numeric,
  uploaded_by     uuid references auth.users(id),
  uploaded_at     timestamptz default now()
);
alter table public.delivery_sales disable row level security;
grant all on public.delivery_sales to anon, authenticated;

-- ============================================================
-- 4. MEAL COUNT
-- ============================================================
create table if not exists public.meal_count (
  id                        bigserial primary key,
  restaurant_name           text not null,
  date                      date not null,
  super_category            text,
  category                  text,
  item_code                 text,
  item_name                 text,
  item_rate                 numeric,
  item_quantity             numeric,
  combo_constituent_qty     numeric,
  total_quantity            numeric,
  portion_value             numeric,
  meal_count                numeric,
  total_price               numeric,
  uploaded_by               uuid references auth.users(id),
  uploaded_at               timestamptz default now()
);
alter table public.meal_count disable row level security;
grant all on public.meal_count to anon, authenticated;

-- ============================================================
-- 5. MENU MIX
-- ============================================================
create table if not exists public.menu_mix (
  id              bigserial primary key,
  restaurant_name text not null,
  date            date not null,
  scategory       text,
  item_number     text,
  item_name       text,
  comp_qty        numeric,
  non_comp_qty    numeric,
  number_sold     numeric,
  price_sold      numeric,
  amount          numeric,
  comp_amount     numeric,
  discount_amount numeric,
  total_discount  numeric,
  net_sales       numeric,
  pct_of_sales    numeric,
  pct_of_scategory numeric,
  uploaded_by     uuid references auth.users(id),
  uploaded_at     timestamptz default now()
);
alter table public.menu_mix disable row level security;
grant all on public.menu_mix to anon, authenticated;

-- ============================================================
-- 6. INVENTORY & WASTAGE
-- ============================================================
create table if not exists public.inventory (
  id                    bigserial primary key,
  restaurant_name       text not null,
  date                  date not null,
  item_code             text,
  item_name             text,
  unit                  text,
  category              text,
  average_price         numeric,
  opening               numeric,
  purchase              numeric,
  consumption           numeric,
  wastage               numeric,
  closing               numeric,
  latest_physical       date,
  physical_qty          numeric,
  variance              numeric,
  variance_pct          numeric,
  actual_consumption    numeric,
  uploaded_by           uuid references auth.users(id),
  uploaded_at           timestamptz default now()
);
alter table public.inventory disable row level security;
grant all on public.inventory to anon, authenticated;

-- ============================================================
-- 7. UPLOAD LOG
-- ============================================================
create table if not exists public.upload_log (
  id              bigserial primary key,
  file_name       text,
  report_type     text,
  restaurant_name text,
  date            date,
  rows_inserted   int,
  uploaded_by     uuid references auth.users(id),
  uploaded_at     timestamptz default now()
);
alter table public.upload_log disable row level security;
grant all on public.upload_log to anon, authenticated;

-- Grant sequences
grant usage, select on all sequences in schema public to anon, authenticated;
