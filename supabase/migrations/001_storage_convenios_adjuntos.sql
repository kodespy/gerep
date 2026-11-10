-- Bucket "convenios_adjuntos" para archivos adjuntos de convenios.
-- Ejecutar en SQL Editor de Supabase (proyecto uepdb) solo si el bucket aún no existe.

insert into storage.buckets (id, name, public)
values ('convenios_adjuntos', 'convenios_adjuntos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "convenios_adjuntos_auth_select" on storage.objects;
drop policy if exists "convenios_adjuntos_auth_insert" on storage.objects;
drop policy if exists "convenios_adjuntos_auth_update" on storage.objects;
drop policy if exists "convenios_adjuntos_auth_delete" on storage.objects;

create policy "convenios_adjuntos_auth_select" on storage.objects
  for select
  to authenticated
  using (bucket_id = 'convenios_adjuntos');

create policy "convenios_adjuntos_auth_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'convenios_adjuntos');

create policy "convenios_adjuntos_auth_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'convenios_adjuntos');

create policy "convenios_adjuntos_auth_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'convenios_adjuntos');
