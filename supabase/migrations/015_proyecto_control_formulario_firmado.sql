-- Archivo firmado del Formulario de Control de Proyecto.
-- Ejecutar en SQL Editor de Supabase (proyecto uepdb) si aún no existe.

alter table public.proyecto_control_formularios
  add column if not exists archivo_firmado text;

insert into storage.buckets (id, name, public)
values ('proyecto-control-formularios', 'proyecto-control-formularios', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "proyecto_control_formularios_auth_select" on storage.objects;
drop policy if exists "proyecto_control_formularios_auth_insert" on storage.objects;
drop policy if exists "proyecto_control_formularios_auth_update" on storage.objects;
drop policy if exists "proyecto_control_formularios_auth_delete" on storage.objects;

create policy "proyecto_control_formularios_auth_select" on storage.objects
  for select
  to authenticated
  using (bucket_id = 'proyecto-control-formularios');

create policy "proyecto_control_formularios_auth_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'proyecto-control-formularios');

create policy "proyecto_control_formularios_auth_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'proyecto-control-formularios');

create policy "proyecto_control_formularios_auth_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'proyecto-control-formularios');
