-- Ejecutar TODO el bloque en Supabase → SQL Editor
-- (proyecto oumwtlgiwakcuhzsrjus / el de VITE_SUPABASE_URL).

alter table public.strs
  add column if not exists resolution_id uuid references public.resolutions (id) on delete restrict;

alter table public.strs
  add column if not exists resolution_item_id uuid references public.resolution_items (id) on delete restrict;

create index if not exists strs_resolution_id_idx on public.strs (resolution_id);
create index if not exists strs_resolution_item_id_idx on public.strs (resolution_item_id);
