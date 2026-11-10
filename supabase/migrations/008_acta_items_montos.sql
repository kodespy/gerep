-- Montos por ítem de acta (detalle de ejecución / PDF multi-fila).
-- Ejecutar en SQL Editor de Supabase si las columnas aún no existen.

alter table public.acta_items
  add column if not exists monto_solicitado numeric default 0;

alter table public.acta_items
  add column if not exists monto_aprobado numeric default 0;

alter table public.acta_items
  add column if not exists monto_ejecutado numeric default 0;
