-- Ítems de desarrollo del expediente (fecha + descripción).
-- Ejecutar TODO el bloque en Supabase → SQL Editor.

create table if not exists public.expediente_desarrollos (
  id uuid primary key default gen_random_uuid()
);

alter table public.expediente_desarrollos add column if not exists expediente_id uuid;
alter table public.expediente_desarrollos add column if not exists fecha date;
alter table public.expediente_desarrollos add column if not exists descripcion text;
alter table public.expediente_desarrollos add column if not exists area_id uuid;
alter table public.expediente_desarrollos add column if not exists created_by uuid;
alter table public.expediente_desarrollos add column if not exists created_at timestamptz;

alter table public.expediente_desarrollos alter column fecha set default current_date;
alter table public.expediente_desarrollos alter column created_at set default now();

update public.expediente_desarrollos set fecha = current_date where fecha is null;
update public.expediente_desarrollos set descripcion = coalesce(nullif(trim(descripcion), ''), '—') where descripcion is null;
update public.expediente_desarrollos set created_at = now() where created_at is null;

alter table public.expediente_desarrollos alter column expediente_id set not null;
alter table public.expediente_desarrollos alter column fecha set not null;
alter table public.expediente_desarrollos alter column descripcion set not null;
alter table public.expediente_desarrollos alter column created_at set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expediente_desarrollos_expediente_id_fkey') then
    alter table public.expediente_desarrollos
      add constraint expediente_desarrollos_expediente_id_fkey
      foreign key (expediente_id) references public.expedientes (id)
      on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expediente_desarrollos_area_id_fkey') then
    alter table public.expediente_desarrollos
      add constraint expediente_desarrollos_area_id_fkey
      foreign key (area_id) references public.areas (id)
      on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expediente_desarrollos_created_by_fkey') then
    alter table public.expediente_desarrollos
      add constraint expediente_desarrollos_created_by_fkey
      foreign key (created_by) references auth.users (id)
      on delete set null;
  end if;
end $$;

create index if not exists expediente_desarrollos_exp_fecha_idx
  on public.expediente_desarrollos (expediente_id, fecha desc, created_at desc);

comment on table public.expediente_desarrollos is
  'Bitácora de desarrollo del expediente: fecha y descripción (ej. retraso, observaciones).';

alter table public.expediente_desarrollos enable row level security;

drop policy if exists "expediente_desarrollos_auth_select" on public.expediente_desarrollos;
drop policy if exists "expediente_desarrollos_auth_insert" on public.expediente_desarrollos;
drop policy if exists "expediente_desarrollos_auth_update" on public.expediente_desarrollos;
drop policy if exists "expediente_desarrollos_auth_delete" on public.expediente_desarrollos;

create policy "expediente_desarrollos_auth_select" on public.expediente_desarrollos
  for select to authenticated using (true);

create policy "expediente_desarrollos_auth_insert" on public.expediente_desarrollos
  for insert to authenticated with check (true);

create policy "expediente_desarrollos_auth_update" on public.expediente_desarrollos
  for update to authenticated using (true) with check (true);

create policy "expediente_desarrollos_auth_delete" on public.expediente_desarrollos
  for delete to authenticated using (true);

grant select, insert, update, delete on public.expediente_desarrollos to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_auditoria_row'
  ) then
    drop trigger if exists trg_auditoria_expediente_desarrollos on public.expediente_desarrollos;
    create trigger trg_auditoria_expediente_desarrollos
      after insert or update or delete on public.expediente_desarrollos
      for each row execute function public.fn_auditoria_row();
  end if;
end $$;

notify pgrst, 'reload schema';
