-- Vincula un ítem de acta a una adenda (aprobación / desembolso de ese ajuste).
-- NULL = ítem del plan original. Idempotente: ejecutar en Supabase → SQL Editor.

alter table public.acta_items
  add column if not exists adenda_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'acta_items_adenda_id_fkey'
  ) then
    alter table public.acta_items
      add constraint acta_items_adenda_id_fkey
      foreign key (adenda_id) references public.adendas (id)
      on delete restrict;
  end if;
end $$;

create index if not exists acta_items_adenda_id_idx
  on public.acta_items (adenda_id)
  where adenda_id is not null;

-- Una adenda no puede estar en dos ítems de acta a la vez.
create unique index if not exists acta_items_adenda_id_uq
  on public.acta_items (adenda_id)
  where adenda_id is not null;

comment on column public.acta_items.adenda_id is
  'Si está informado, el ítem aprueba o desembolsa esa adenda (no el plan original).';
