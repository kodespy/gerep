-- (Opcional / legado) Columna en actas.
-- El vínculo correcto acta ↔ plan financiero es la tabla existente `acta_items`
-- (acta_id, plan_financiero_id, user_id, created_at).
-- Puede omitirse si no se necesita plan_financiero_id en `actas`.

alter table public.actas
  add column if not exists plan_financiero_id uuid references public.planes_financieros(id) on delete set null;

create index if not exists actas_plan_financiero_id_idx on public.actas(plan_financiero_id);
