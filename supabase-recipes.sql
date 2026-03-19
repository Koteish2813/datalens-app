-- ============================================================
-- Recipes Tables
-- Run in Supabase SQL Editor
-- ============================================================

-- Recipes header table
create table if not exists public.recipes (
  id            bigserial primary key,
  recipe_code   text not null unique,
  recipe_name   text not null,
  recipe_qty    numeric default 1,
  recipe_unit   text default 'PORTION',
  file_price    numeric default 0,
  file_avg_price numeric default 0,
  file_last_price numeric default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.recipes disable row level security;
grant all on public.recipes to anon, authenticated;
grant usage, select on sequence public.recipes_id_seq to anon, authenticated;

-- Recipe ingredients table
create table if not exists public.recipe_ingredients (
  id              bigserial primary key,
  recipe_code     text not null references public.recipes(recipe_code) on delete cascade,
  ingredient_code text not null,
  ingredient_name text not null,
  ingredient_qty  numeric default 0,
  ingredient_unit text,
  created_at      timestamptz default now()
);

alter table public.recipe_ingredients disable row level security;
grant all on public.recipe_ingredients to anon, authenticated;
grant usage, select on sequence public.recipe_ingredients_id_seq to anon, authenticated;

create index if not exists recipe_ingredients_recipe_code_idx on public.recipe_ingredients(recipe_code);
create index if not exists recipe_ingredients_ingredient_code_idx on public.recipe_ingredients(ingredient_code);
