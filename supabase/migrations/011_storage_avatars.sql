-- Bucket público "avatars" para fotos de perfil.
-- Ejecutar en SQL Editor de Supabase si el bucket aún no existe.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars_public_select" on storage.objects;
drop policy if exists "avatars_auth_insert" on storage.objects;
drop policy if exists "avatars_auth_update" on storage.objects;
drop policy if exists "avatars_auth_delete" on storage.objects;

-- Lectura pública (URLs públicas del avatar)
create policy "avatars_public_select" on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

-- Cada usuario solo escribe/borra dentro de su carpeta {user_id}/...
create policy "avatars_auth_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_auth_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_auth_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
