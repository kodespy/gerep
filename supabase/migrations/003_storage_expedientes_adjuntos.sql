-- Bucket "expedientes_adjuntos" para archivos de la tabla expediente_adjuntos.
-- Ejecutar en SQL Editor de Supabase si el bucket aún no existe.

insert into storage.buckets (id, name, public)
values ('expedientes_adjuntos', 'expedientes_adjuntos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "expedientes_adjuntos_auth_select" on storage.objects;
drop policy if exists "expedientes_adjuntos_auth_insert" on storage.objects;
drop policy if exists "expedientes_adjuntos_auth_update" on storage.objects;
drop policy if exists "expedientes_adjuntos_auth_delete" on storage.objects;

create policy "expedientes_adjuntos_auth_select" on storage.objects
  for select
  to authenticated
  using (bucket_id = 'expedientes_adjuntos');

create policy "expedientes_adjuntos_auth_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'expedientes_adjuntos');

create policy "expedientes_adjuntos_auth_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'expedientes_adjuntos');

create policy "expedientes_adjuntos_auth_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'expedientes_adjuntos');
