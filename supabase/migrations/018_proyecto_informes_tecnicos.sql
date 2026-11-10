-- Informe Técnico de Verificación · Gestión Operacional (por proyecto).
-- Ejecutar en SQL Editor de Supabase si aún no existe.

create table if not exists public.proyecto_informes_tecnicos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  numero text not null,
  entidad_proponente text,
  monto_solicitado numeric,
  objeto_gasto text,
  marco_normativo text default 'Resolución SND N.º 227/2026',
  fecha_verificacion date,
  verificado_por text,
  datos_generales jsonb not null default '{}'::jsonb,
  verificacion_documental jsonb not null default '[]'::jsonb,
  verificacion_financiera jsonb not null default '{}'::jsonb,
  verificacion_tiempo jsonb not null default '[]'::jsonb,
  otros_aspectos jsonb not null default '[]'::jsonb,
  conclusion text,
  recomendacion text,
  resultado_verificacion text,
  archivo_firmado text,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists proyecto_informes_tecnicos_proyecto_numero_uidx
  on public.proyecto_informes_tecnicos (proyecto_id, numero);

create index if not exists proyecto_informes_tecnicos_proyecto_id_idx
  on public.proyecto_informes_tecnicos (proyecto_id);

alter table public.proyecto_informes_tecnicos enable row level security;

drop policy if exists "proyecto_informes_tecnicos_select" on public.proyecto_informes_tecnicos;
drop policy if exists "proyecto_informes_tecnicos_insert" on public.proyecto_informes_tecnicos;
drop policy if exists "proyecto_informes_tecnicos_update" on public.proyecto_informes_tecnicos;
drop policy if exists "proyecto_informes_tecnicos_delete" on public.proyecto_informes_tecnicos;

create policy "proyecto_informes_tecnicos_select"
  on public.proyecto_informes_tecnicos for select to authenticated using (true);

create policy "proyecto_informes_tecnicos_insert"
  on public.proyecto_informes_tecnicos for insert to authenticated with check (true);

create policy "proyecto_informes_tecnicos_update"
  on public.proyecto_informes_tecnicos for update to authenticated using (true);

create policy "proyecto_informes_tecnicos_delete"
  on public.proyecto_informes_tecnicos for delete to authenticated using (true);

insert into storage.buckets (id, name, public)
values ('proyecto-informes-tecnicos', 'proyecto-informes-tecnicos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "proyecto_informes_tecnicos_auth_select" on storage.objects;
drop policy if exists "proyecto_informes_tecnicos_auth_insert" on storage.objects;
drop policy if exists "proyecto_informes_tecnicos_auth_update" on storage.objects;
drop policy if exists "proyecto_informes_tecnicos_auth_delete" on storage.objects;

create policy "proyecto_informes_tecnicos_auth_select" on storage.objects
  for select to authenticated using (bucket_id = 'proyecto-informes-tecnicos');

create policy "proyecto_informes_tecnicos_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'proyecto-informes-tecnicos');

create policy "proyecto_informes_tecnicos_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'proyecto-informes-tecnicos');

create policy "proyecto_informes_tecnicos_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'proyecto-informes-tecnicos');
