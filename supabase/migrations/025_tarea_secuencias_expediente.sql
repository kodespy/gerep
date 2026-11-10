-- Secuencias de tareas (plantillas) para asignar al derivar (área/persona destino).
-- Ejecutar en SQL Editor de Supabase si aún no existe.
-- Las instancias de tareas viven en seguimiento_tareas (ver migración 026).

create table if not exists public.tarea_secuencias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  color text default 'teal',
  activo boolean not null default true,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tarea_secuencia_items (
  id uuid primary key default gen_random_uuid(),
  secuencia_id uuid not null references public.tarea_secuencias (id) on delete cascade,
  orden integer not null default 1,
  titulo text not null,
  descripcion text,
  dias_plazo integer not null default 1 check (dias_plazo >= 0),
  created_at timestamptz not null default now()
);

create index if not exists tarea_secuencia_items_secuencia_id_idx
  on public.tarea_secuencia_items (secuencia_id, orden);

alter table public.tarea_secuencias enable row level security;
alter table public.tarea_secuencia_items enable row level security;

drop policy if exists "tarea_secuencias_select" on public.tarea_secuencias;
drop policy if exists "tarea_secuencias_insert" on public.tarea_secuencias;
drop policy if exists "tarea_secuencias_update" on public.tarea_secuencias;
drop policy if exists "tarea_secuencias_delete" on public.tarea_secuencias;

create policy "tarea_secuencias_select" on public.tarea_secuencias
  for select to authenticated using (true);
create policy "tarea_secuencias_insert" on public.tarea_secuencias
  for insert to authenticated with check (true);
create policy "tarea_secuencias_update" on public.tarea_secuencias
  for update to authenticated using (true);
create policy "tarea_secuencias_delete" on public.tarea_secuencias
  for delete to authenticated using (true);

drop policy if exists "tarea_secuencia_items_select" on public.tarea_secuencia_items;
drop policy if exists "tarea_secuencia_items_insert" on public.tarea_secuencia_items;
drop policy if exists "tarea_secuencia_items_update" on public.tarea_secuencia_items;
drop policy if exists "tarea_secuencia_items_delete" on public.tarea_secuencia_items;

create policy "tarea_secuencia_items_select" on public.tarea_secuencia_items
  for select to authenticated using (true);
create policy "tarea_secuencia_items_insert" on public.tarea_secuencia_items
  for insert to authenticated with check (true);
create policy "tarea_secuencia_items_update" on public.tarea_secuencia_items
  for update to authenticated using (true);
create policy "tarea_secuencia_items_delete" on public.tarea_secuencia_items
  for delete to authenticated using (true);
