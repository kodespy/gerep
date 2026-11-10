-- Doc. Sustancial (booleano) en ítems predeterminados del control de rendiciones.

alter table public.rendiciones_cuentas_items_predeterminados
  add column if not exists doc_sustancial boolean not null default false;
