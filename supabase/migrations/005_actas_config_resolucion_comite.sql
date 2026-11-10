-- Columna resolución de comité en configuración de actas
alter table public.actas_configuracion_registros
  add column if not exists resolucion_comite text;
