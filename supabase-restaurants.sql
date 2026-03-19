-- Run this in Supabase SQL Editor

-- Restaurants table
create table if not exists public.restaurants (
  id         bigserial primary key,
  name       text not null unique,
  code       text,
  active     boolean default true,
  created_at timestamptz default now()
);

alter table public.restaurants disable row level security;
grant all on public.restaurants to anon, authenticated;
grant usage, select on sequence public.restaurants_id_seq to anon, authenticated;

-- Insert your 3 restaurants
insert into public.restaurants (name, code) values
  ('ALBAIK - BY JH01 - Al JAHRA - 1007001',       'JH01'),
  ('ALBAIK - BY KW01 - AVENUES - 1007002',         'KW01'),
  ('ALBAIK - BY AH01 - AL KHIRAN MALL - 1007003',  'AH01')
on conflict (name) do nothing;
