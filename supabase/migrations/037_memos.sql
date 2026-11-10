-- Memos institucionales (Mesa de entrada).
-- Idempotente: se puede re-ejecutar si la tabla ya existía incompleta
-- (CREATE TABLE IF NOT EXISTS no agrega columnas faltantes).
-- Ejecutar TODO el bloque en Supabase → SQL Editor.

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid()
);

alter table public.memos add column if not exists numero text;
alter table public.memos add column if not exists fecha date;
alter table public.memos add column if not exists de_funcionario_id uuid;
alter table public.memos add column if not exists para_funcionario_id uuid;
alter table public.memos add column if not exists cc_funcionario_ids uuid[];
alter table public.memos add column if not exists cc_otros text[];
alter table public.memos add column if not exists asunto text;
alter table public.memos add column if not exists cuerpo text;
alter table public.memos add column if not exists archivo_firmado text;
alter table public.memos add column if not exists created_by uuid;
alter table public.memos add column if not exists created_at timestamptz;
alter table public.memos add column if not exists updated_at timestamptz;

alter table public.memos alter column fecha set default current_date;
alter table public.memos alter column cc_funcionario_ids set default '{}';
alter table public.memos alter column cc_otros set default '{}';
alter table public.memos alter column cuerpo set default '';
alter table public.memos alter column created_at set default now();
alter table public.memos alter column updated_at set default now();

update public.memos set fecha = current_date where fecha is null;
update public.memos set cc_funcionario_ids = '{}' where cc_funcionario_ids is null;
update public.memos set cc_otros = '{}' where cc_otros is null;
update public.memos set cuerpo = coalesce(cuerpo, '');
update public.memos set asunto = coalesce(nullif(trim(asunto), ''), '—') where asunto is null;
update public.memos
  set numero = coalesce(nullif(trim(numero), ''), 'PENDIENTE-' || left(id::text, 8))
  where numero is null;
update public.memos set created_at = now() where created_at is null;
update public.memos set updated_at = now() where updated_at is null;

alter table public.memos alter column numero set not null;
alter table public.memos alter column fecha set not null;
alter table public.memos alter column cc_funcionario_ids set not null;
alter table public.memos alter column cc_otros set not null;
alter table public.memos alter column asunto set not null;
alter table public.memos alter column cuerpo set not null;
alter table public.memos alter column created_at set not null;
alter table public.memos alter column updated_at set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'memos_numero_uq') then
    alter table public.memos add constraint memos_numero_uq unique (numero);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'memos_de_funcionario_id_fkey') then
    alter table public.memos
      add constraint memos_de_funcionario_id_fkey
      foreign key (de_funcionario_id) references public.funcionarios (id)
      on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'memos_para_funcionario_id_fkey') then
    alter table public.memos
      add constraint memos_para_funcionario_id_fkey
      foreign key (para_funcionario_id) references public.funcionarios (id)
      on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'memos_created_by_fkey') then
    alter table public.memos
      add constraint memos_created_by_fkey
      foreign key (created_by) references auth.users (id);
  end if;
end $$;

create index if not exists memos_fecha_idx on public.memos (fecha desc);
create index if not exists memos_de_idx on public.memos (de_funcionario_id);
create index if not exists memos_para_idx on public.memos (para_funcionario_id);

alter table public.memos enable row level security;

drop policy if exists "memos_auth_select" on public.memos;
drop policy if exists "memos_auth_insert" on public.memos;
drop policy if exists "memos_auth_update" on public.memos;
drop policy if exists "memos_auth_delete" on public.memos;

create policy "memos_auth_select" on public.memos
  for select to authenticated using (true);

create policy "memos_auth_insert" on public.memos
  for insert to authenticated with check (true);

create policy "memos_auth_update" on public.memos
  for update to authenticated using (true) with check (true);

create policy "memos_auth_delete" on public.memos
  for delete to authenticated using (true);

grant select, insert, update, delete on public.memos to authenticated;

insert into storage.buckets (id, name, public)
values ('memo-archivos', 'memo-archivos', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "memo_archivos_auth_select" on storage.objects;
drop policy if exists "memo_archivos_auth_insert" on storage.objects;
drop policy if exists "memo_archivos_auth_update" on storage.objects;
drop policy if exists "memo_archivos_auth_delete" on storage.objects;

create policy "memo_archivos_auth_select" on storage.objects
  for select to authenticated using (bucket_id = 'memo-archivos');

create policy "memo_archivos_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'memo-archivos');

create policy "memo_archivos_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'memo-archivos');

create policy "memo_archivos_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'memo-archivos');

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_auditoria_row'
  ) then
    drop trigger if exists trg_auditoria_memos on public.memos;
    create trigger trg_auditoria_memos
      after insert or update or delete on public.memos
      for each row execute function public.fn_auditoria_row();
  end if;
end $$;

notify pgrst, 'reload schema';
