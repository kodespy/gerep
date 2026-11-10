-- Actualiza el check de estado de rendiciones_cuentas a:
--   Presentada | Observada | Aprobada
-- Primero se elimina el check (si no, el UPDATE a valores nuevos falla).

alter table public.rendiciones_cuentas drop constraint if exists rendiciones_cuentas_estado_check;

update public.rendiciones_cuentas
set estado = case
  when lower(trim(coalesce(estado, ''))) ~ 'observad'
    then 'Observada'
  when lower(trim(coalesce(estado, ''))) ~ 'aprobad'
    or lower(trim(coalesce(estado, ''))) in ('final', 'finalizada', 'finalizado')
    then 'Aprobada'
  else 'Presentada'
end;

alter table public.rendiciones_cuentas
  add constraint rendiciones_cuentas_estado_check
  check (
    estado is null
    or estado in (
      'Presentada',
      'Observada',
      'Aprobada'
    )
  );
