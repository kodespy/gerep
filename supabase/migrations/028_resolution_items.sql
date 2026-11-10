-- Ítems del plan presupuestario aprobado por resolución (OG + monto, 1..n).
-- Ejecutar en SQL Editor de Supabase (proyecto de la app) si la tabla aún no existe.

create table if not exists public.resolution_items (
  id uuid primary key default gen_random_uuid(),
  resolution_id uuid not null references public.resolutions (id) on delete cascade,
  og_id uuid not null references public.objetos_de_gastos (id),
  monto numeric not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists resolution_items_resolution_id_idx
  on public.resolution_items (resolution_id);

create index if not exists resolution_items_og_id_idx
  on public.resolution_items (og_id);

alter table public.resolution_items enable row level security;

drop policy if exists "resolution_items_select" on public.resolution_items;
drop policy if exists "resolution_items_insert" on public.resolution_items;
drop policy if exists "resolution_items_update" on public.resolution_items;
drop policy if exists "resolution_items_delete" on public.resolution_items;

create policy "resolution_items_select" on public.resolution_items
  for select to authenticated using (true);

create policy "resolution_items_insert" on public.resolution_items
  for insert to authenticated with check (true);

create policy "resolution_items_update" on public.resolution_items
  for update to authenticated using (true) with check (true);

create policy "resolution_items_delete" on public.resolution_items
  for delete to authenticated using (true);

comment on table public.resolution_items is
  'Plan presupuestario aprobado de la resolución: uno o varios ítems con OG y monto.';
