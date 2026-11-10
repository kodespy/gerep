-- Documentos varios del proyecto: usa la tabla y bucket YA existentes.
-- public.proyecto_adjuntos + storage bucket proyecto_adjuntos
-- Este script solo asegura políticas RLS del bucket (idempotente).
-- NO crea la tabla ni el bucket.

-- Bucket (por si faltara en algún entorno)
insert into storage.buckets (id, name, public)
values ('proyecto_adjuntos', 'proyecto_adjuntos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "proyecto_adjuntos_auth_select" on storage.objects;
drop policy if exists "proyecto_adjuntos_auth_insert" on storage.objects;
drop policy if exists "proyecto_adjuntos_auth_update" on storage.objects;
drop policy if exists "proyecto_adjuntos_auth_delete" on storage.objects;

create policy "proyecto_adjuntos_auth_select" on storage.objects
  for select
  to authenticated
  using (bucket_id = 'proyecto_adjuntos');

create policy "proyecto_adjuntos_auth_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'proyecto_adjuntos');

create policy "proyecto_adjuntos_auth_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'proyecto_adjuntos');

create policy "proyecto_adjuntos_auth_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'proyecto_adjuntos');
