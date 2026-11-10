-- Recepción en áreas externas (seguimiento de expedientes).
-- Ejecutar en SQL Editor de Supabase si aún no existe.

alter table public.expediente_seguimiento
  add column if not exists quien_recibio text;

alter table public.expediente_seguimiento
  add column if not exists nro_expediente_asignado text;

alter table public.expediente_seguimiento
  add column if not exists observacion_recepcion text;
