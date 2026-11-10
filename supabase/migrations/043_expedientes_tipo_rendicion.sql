-- Tipo de expediente y datos extraídos del formulario de rendición de cuentas.

alter table public.expedientes
  add column if not exists tipo text;

update public.expedientes
set tipo = 'General'
where tipo is null or btrim(tipo) = '';

alter table public.expedientes
  alter column tipo set default 'General';

alter table public.expedientes
  drop constraint if exists expedientes_tipo_check;

alter table public.expedientes
  add constraint expedientes_tipo_check
  check (tipo in ('General', 'Rendición de Cuentas'));

alter table public.expedientes
  add column if not exists datos_rendicion jsonb;

comment on column public.expedientes.tipo is
  'Clasificación del trámite: General o Rendición de Cuentas.';

comment on column public.expedientes.datos_rendicion is
  'Datos del formulario de rendición (STR, monto, fecha, período, observaciones).';
