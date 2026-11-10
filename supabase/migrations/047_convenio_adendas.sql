-- Adendas de convenio (0..n) con PDF firmado.
-- La tabla public.convenio_adendas ya existía; se agregan número, fecha y archivo.

alter table public.convenio_adendas
  add column if not exists numero text,
  add column if not exists fecha date,
  add column if not exists archivo_firmado text,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

create index if not exists convenio_adendas_convenio_id_idx
  on public.convenio_adendas (convenio_id);

alter table public.convenio_adendas enable row level security;

drop policy if exists "convenio_adendas_select" on public.convenio_adendas;
drop policy if exists "convenio_adendas_insert" on public.convenio_adendas;
drop policy if exists "convenio_adendas_update" on public.convenio_adendas;
drop policy if exists "convenio_adendas_delete" on public.convenio_adendas;

create policy "convenio_adendas_select"
  on public.convenio_adendas for select
  to authenticated
  using (true);

create policy "convenio_adendas_insert"
  on public.convenio_adendas for insert
  to authenticated
  with check (true);

create policy "convenio_adendas_update"
  on public.convenio_adendas for update
  to authenticated
  using (true);

create policy "convenio_adendas_delete"
  on public.convenio_adendas for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.convenio_adendas to authenticated;

insert into public.convenio_adendas (convenio_id, numero, fecha, archivo_firmado, created_by)
select
  c.id,
  coalesce(nullif(trim(c.adenda_numero), ''), '1'),
  c.fecha_adenda,
  c.adenda_archivo_firmado,
  c.created_by
from public.convenios c
where (
  nullif(trim(coalesce(c.adenda_numero, '')), '') is not null
  or c.fecha_adenda is not null
  or nullif(trim(coalesce(c.adenda_archivo_firmado, '')), '') is not null
)
and not exists (
  select 1 from public.convenio_adendas a where a.convenio_id = c.id
);
