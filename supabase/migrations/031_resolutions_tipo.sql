-- Tipo de resolución: solo aprobación (sin plan) o con plan presupuestario.

alter table public.resolutions
  add column if not exists tipo text;

update public.resolutions r
set tipo = 'Plan presupuestario'
where coalesce(nullif(trim(r.tipo), ''), '') = ''
  and exists (
    select 1 from public.resolution_items i where i.resolution_id = r.id
  );

update public.resolutions
set tipo = 'Aprobación'
where coalesce(nullif(trim(tipo), ''), '') = '';

alter table public.resolutions
  alter column tipo set default 'Aprobación';

alter table public.resolutions
  drop constraint if exists resolutions_tipo_check;

alter table public.resolutions
  add constraint resolutions_tipo_check
  check (tipo in ('Aprobación', 'Plan presupuestario'));
