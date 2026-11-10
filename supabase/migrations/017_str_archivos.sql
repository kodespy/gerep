-- Adjuntos varios por STR (mismo patrón que rendicion_archivos / cdp_archivos).
-- Ejecutar en SQL Editor de Supabase si aún no existe.

create table if not exists public.str_archivos (
  id uuid primary key default gen_random_uuid(),
  str_id uuid not null references public.strs (id) on delete cascade,
  url_archivo text not null,
  nombre_archivo text,
  usuario_id uuid not null references auth.users (id) on delete cascade
);

create index if not exists str_archivos_str_id_idx
  on public.str_archivos (str_id);

alter table public.str_archivos enable row level security;

drop policy if exists "str_archivos_select" on public.str_archivos;
drop policy if exists "str_archivos_insert" on public.str_archivos;
drop policy if exists "str_archivos_update" on public.str_archivos;
drop policy if exists "str_archivos_delete" on public.str_archivos;

create policy "str_archivos_select"
  on public.str_archivos for select
  to authenticated
  using (true);

create policy "str_archivos_insert"
  on public.str_archivos for insert
  to authenticated
  with check (true);

create policy "str_archivos_update"
  on public.str_archivos for update
  to authenticated
  using (true);

create policy "str_archivos_delete"
  on public.str_archivos for delete
  to authenticated
  using (true);

insert into storage.buckets (id, name, public)
values ('str-archivos', 'str-archivos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "str_archivos_auth_select" on storage.objects;
drop policy if exists "str_archivos_auth_insert" on storage.objects;
drop policy if exists "str_archivos_auth_update" on storage.objects;
drop policy if exists "str_archivos_auth_delete" on storage.objects;

create policy "str_archivos_auth_select" on storage.objects
  for select
  to authenticated
  using (bucket_id = 'str-archivos');

create policy "str_archivos_auth_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'str-archivos');

create policy "str_archivos_auth_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'str-archivos');

create policy "str_archivos_auth_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'str-archivos');
