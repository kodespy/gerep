-- Plazos en tareas de derivación (asignadas al área/persona destino).
-- Las tareas viven en seguimiento_tareas, no en el expediente.

alter table public.seguimiento_tareas
  add column if not exists dias_plazo integer not null default 0 check (dias_plazo >= 0);

alter table public.seguimiento_tareas
  add column if not exists fecha_vencimiento date;

alter table public.seguimiento_tareas
  add column if not exists secuencia_id uuid references public.tarea_secuencias (id) on delete set null;

comment on column public.seguimiento_tareas.dias_plazo is
  'Días de plazo desde la derivación para el área destino.';
comment on column public.seguimiento_tareas.fecha_vencimiento is
  'Fecha límite calculada al derivar (inicio + dias_plazo).';

-- Ya no se usan tareas a nivel expediente; se puede eliminar la tabla si existía.
drop table if exists public.expediente_tareas;
