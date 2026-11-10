-- Bucket "resolutions-archivos" para archivos adjuntos de resoluciones.
-- Ejecutar en SQL Editor de Supabase (proyecto uepdb) solo si el bucket aún no existe.

insert into storage.buckets (id, name, public)
values ('resolutions-archivos', 'resolutions-archivos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "resolutions_archivos_auth_select" on storage.objects;
drop policy if exists "resolutions_archivos_auth_insert" on storage.objects;
drop policy if exists "resolutions_archivos_auth_update" on storage.objects;
drop policy if exists "resolutions_archivos_auth_delete" on storage.objects;

create policy "resolutions_archivos_auth_select" on storage.objects
  for select
  to authenticated
  using (bucket_id = 'resolutions-archivos');

create policy "resolutions_archivos_auth_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'resolutions-archivos');

create policy "resolutions_archivos_auth_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'resolutions-archivos');

create policy "resolutions_archivos_auth_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'resolutions-archivos');
