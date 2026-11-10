-- Columna para acta firmada + bucket "acta-archivos".
-- Ejecutar en SQL Editor de Supabase (proyecto uepdb) si aún no existe.

alter table public.actas
  add column if not exists archivo_firmado text;

insert into storage.buckets (id, name, public)
values ('acta-archivos', 'acta-archivos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "acta_archivos_auth_select" on storage.objects;
drop policy if exists "acta_archivos_auth_insert" on storage.objects;
drop policy if exists "acta_archivos_auth_update" on storage.objects;
drop policy if exists "acta_archivos_auth_delete" on storage.objects;

create policy "acta_archivos_auth_select" on storage.objects
  for select
  to authenticated
  using (bucket_id = 'acta-archivos');

create policy "acta_archivos_auth_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'acta-archivos');

create policy "acta_archivos_auth_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'acta-archivos');

create policy "acta_archivos_auth_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'acta-archivos');
