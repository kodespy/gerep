-- rendicion_archivos (esquema real verificado) + bucket rendicion-archivos
-- Columnas: id, rendicion_id, url_archivo, nombre_archivo

create table if not exists public.rendicion_archivos (
  id uuid primary key default gen_random_uuid(),
  rendicion_id uuid not null references public.rendiciones_cuentas (id) on delete cascade,
  url_archivo text not null,
  nombre_archivo text,
  usuario_id uuid not null references auth.users (id) on delete cascade
);

create index if not exists rendicion_archivos_rendicion_id_idx
  on public.rendicion_archivos (rendicion_id);

-- Si la tabla ya existía con otras columnas, no las borramos aquí.
-- El código de la app solo usa: id, rendicion_id, url_archivo, nombre_archivo.

alter table public.rendicion_archivos enable row level security;

drop policy if exists "rendicion_archivos_select" on public.rendicion_archivos;
drop policy if exists "rendicion_archivos_insert" on public.rendicion_archivos;
drop policy if exists "rendicion_archivos_update" on public.rendicion_archivos;
drop policy if exists "rendicion_archivos_delete" on public.rendicion_archivos;

create policy "rendicion_archivos_select"
  on public.rendicion_archivos for select
  to authenticated
  using (true);

create policy "rendicion_archivos_insert"
  on public.rendicion_archivos for insert
  to authenticated
  with check (true);

create policy "rendicion_archivos_update"
  on public.rendicion_archivos for update
  to authenticated
  using (true);

create policy "rendicion_archivos_delete"
  on public.rendicion_archivos for delete
  to authenticated
  using (true);

insert into storage.buckets (id, name, public)
values ('rendicion-archivos', 'rendicion-archivos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "rendicion_archivos_auth_select" on storage.objects;
drop policy if exists "rendicion_archivos_auth_insert" on storage.objects;
drop policy if exists "rendicion_archivos_auth_update" on storage.objects;
drop policy if exists "rendicion_archivos_auth_delete" on storage.objects;

create policy "rendicion_archivos_auth_select" on storage.objects
  for select
  to authenticated
  using (bucket_id = 'rendicion-archivos');

create policy "rendicion_archivos_auth_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'rendicion-archivos');

create policy "rendicion_archivos_auth_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'rendicion-archivos');

create policy "rendicion_archivos_auth_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'rendicion-archivos');
