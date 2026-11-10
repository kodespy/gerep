-- Situación actual del expediente en la dependencia que lo tiene en poder.
-- Permite registrar por qué permanece en esa área / en esa mano.

alter table public.expedientes
  add column if not exists situacion_actual text;

alter table public.expedientes
  add column if not exists situacion_actual_at timestamptz;

alter table public.expedientes
  add column if not exists situacion_actual_by uuid references auth.users (id) on delete set null;

comment on column public.expedientes.situacion_actual is
  'Nota del área que tiene el expediente: motivo de permanencia / situación actual.';
comment on column public.expedientes.situacion_actual_at is
  'Fecha/hora de la última actualización de situacion_actual.';
comment on column public.expedientes.situacion_actual_by is
  'Usuario que actualizó situacion_actual.';
