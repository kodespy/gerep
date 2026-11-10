-- Ejecutar en Supabase → SQL Editor si la columna aún no existe.

alter table public.rendiciones_cuentas_items_predeterminados
  add column if not exists doc_sustancial boolean not null default false;
