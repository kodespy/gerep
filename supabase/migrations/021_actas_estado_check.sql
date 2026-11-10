-- Actualiza el check de estado de actas a:
--   Aprobación | Desembolso | Aprobación y desembolso
-- Primero se elimina el check (si no, el UPDATE a valores nuevos falla).

alter table public.actas drop constraint if exists actas_estado_check;

update public.actas
set estado = case
  when lower(trim(coalesce(estado, ''))) in ('desembolso')
    then 'Desembolso'
  when lower(trim(coalesce(estado, ''))) in (
    'aprobacion y desembolso',
    'aprobación y desembolso',
    'aprobada y desembolso'
  )
    then 'Aprobación y desembolso'
  else 'Aprobación'
end;

alter table public.actas
  add constraint actas_estado_check
  check (
    estado is null
    or estado in (
      'Aprobación',
      'Desembolso',
      'Aprobación y desembolso'
    )
  );
