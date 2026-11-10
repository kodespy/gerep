-- Ejecutar TODO el bloque en Supabase → SQL Editor
-- (proyecto oumwtlgiwakcuhzsrjus / el de VITE_SUPABASE_URL).

create table if not exists public.resolution_proyectos (
  id uuid primary key default gen_random_uuid(),
  resolution_id uuid not null references public.resolutions (id) on delete cascade,
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (resolution_id, proyecto_id)
);

create index if not exists resolution_proyectos_resolution_id_idx
  on public.resolution_proyectos (resolution_id);

create index if not exists resolution_proyectos_proyecto_id_idx
  on public.resolution_proyectos (proyecto_id);

alter table public.resolution_proyectos enable row level security;

drop policy if exists "resolution_proyectos_select" on public.resolution_proyectos;
drop policy if exists "resolution_proyectos_insert" on public.resolution_proyectos;
drop policy if exists "resolution_proyectos_update" on public.resolution_proyectos;
drop policy if exists "resolution_proyectos_delete" on public.resolution_proyectos;

create policy "resolution_proyectos_select" on public.resolution_proyectos
  for select to authenticated using (true);

create policy "resolution_proyectos_insert" on public.resolution_proyectos
  for insert to authenticated with check (true);

create policy "resolution_proyectos_update" on public.resolution_proyectos
  for update to authenticated using (true) with check (true);

create policy "resolution_proyectos_delete" on public.resolution_proyectos
  for delete to authenticated using (true);

insert into public.resolution_proyectos (resolution_id, proyecto_id)
select r.id, r.proyecto_id
from public.resolutions r
where r.proyecto_id is not null
on conflict (resolution_id, proyecto_id) do nothing;
