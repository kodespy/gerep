-- Observaciones (texto enriquecido) en Control de Desembolsos.
-- Ejecutar en SQL Editor de Supabase si aún no existe.

alter table public.proyecto_control_desembolsos
  add column if not exists observaciones text;
