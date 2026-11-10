-- STR vinculada a una resolución y a una línea del plan presupuestario (resolution_items).
-- Una resolución → varios STR; una STR → una sola resolución / línea.
-- Ejecutar en SQL Editor del proyecto de la app (VITE_SUPABASE_URL).

alter table public.strs
  add column if not exists resolution_id uuid references public.resolutions (id) on delete restrict;

alter table public.strs
  add column if not exists resolution_item_id uuid references public.resolution_items (id) on delete restrict;

create index if not exists strs_resolution_id_idx on public.strs (resolution_id);
create index if not exists strs_resolution_item_id_idx on public.strs (resolution_item_id);

comment on column public.strs.resolution_id is
  'Resolución a la que pertenece el STR (N STR por resolución; 1 resolución por STR).';
comment on column public.strs.resolution_item_id is
  'Línea del plan presupuestario aprobado (OG + monto) de la resolución.';
