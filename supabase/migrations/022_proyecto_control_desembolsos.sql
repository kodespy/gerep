-- Control de Desembolsos · Gestión Operacional (por proyecto).
-- Ejecutar en SQL Editor de Supabase si aún no existe.

create table if not exists public.proyecto_control_desembolsos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  numero text not null,
  entidad_proponente text,
  monto_total numeric,
  monto_desembolsado numeric,
  monto_solicitado numeric,
  objeto_gasto text,
  marco_normativo text default 'Resolución SND N.º 227/2026',
  fecha_verificacion date,
  verificado_por text,
  elaborador_por text,
  verificacion_documental jsonb not null default '[]'::jsonb,
  observaciones text,
  archivo_firmado text,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists proyecto_control_desembolsos_proyecto_numero_uidx
  on public.proyecto_control_desembolsos (proyecto_id, numero);

create index if not exists proyecto_control_desembolsos_proyecto_id_idx
  on public.proyecto_control_desembolsos (proyecto_id);

alter table public.proyecto_control_desembolsos enable row level security;

drop policy if exists "proyecto_control_desembolsos_select" on public.proyecto_control_desembolsos;
drop policy if exists "proyecto_control_desembolsos_insert" on public.proyecto_control_desembolsos;
drop policy if exists "proyecto_control_desembolsos_update" on public.proyecto_control_desembolsos;
drop policy if exists "proyecto_control_desembolsos_delete" on public.proyecto_control_desembolsos;

create policy "proyecto_control_desembolsos_select"
  on public.proyecto_control_desembolsos for select to authenticated using (true);

create policy "proyecto_control_desembolsos_insert"
  on public.proyecto_control_desembolsos for insert to authenticated with check (true);

create policy "proyecto_control_desembolsos_update"
  on public.proyecto_control_desembolsos for update to authenticated using (true);

create policy "proyecto_control_desembolsos_delete"
  on public.proyecto_control_desembolsos for delete to authenticated using (true);

insert into storage.buckets (id, name, public)
values ('proyecto-control-desembolsos', 'proyecto-control-desembolsos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "proyecto_control_desembolsos_auth_select" on storage.objects;
drop policy if exists "proyecto_control_desembolsos_auth_insert" on storage.objects;
drop policy if exists "proyecto_control_desembolsos_auth_update" on storage.objects;
drop policy if exists "proyecto_control_desembolsos_auth_delete" on storage.objects;

create policy "proyecto_control_desembolsos_auth_select" on storage.objects
  for select to authenticated using (bucket_id = 'proyecto-control-desembolsos');

create policy "proyecto_control_desembolsos_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'proyecto-control-desembolsos');

create policy "proyecto_control_desembolsos_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'proyecto-control-desembolsos');

create policy "proyecto_control_desembolsos_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'proyecto-control-desembolsos');
