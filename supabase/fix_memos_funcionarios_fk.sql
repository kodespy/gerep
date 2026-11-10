-- Completa columnas y FKs de memos. Preferí supabase/fix_memos.sql (script completo).
-- Ejecutar TODO el bloque en Supabase → SQL Editor.

alter table public.memos add column if not exists fecha date;
alter table public.memos alter column fecha set default current_date;
update public.memos set fecha = current_date where fecha is null;
alter table public.memos alter column fecha set not null;

alter table public.memos add column if not exists de_funcionario_id uuid;
alter table public.memos add column if not exists para_funcionario_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'memos_de_funcionario_id_fkey'
  ) then
    alter table public.memos
      add constraint memos_de_funcionario_id_fkey
      foreign key (de_funcionario_id) references public.funcionarios (id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'memos_para_funcionario_id_fkey'
  ) then
    alter table public.memos
      add constraint memos_para_funcionario_id_fkey
      foreign key (para_funcionario_id) references public.funcionarios (id)
      on delete restrict;
  end if;
end $$;

create index if not exists memos_fecha_idx on public.memos (fecha desc);
create index if not exists memos_de_idx on public.memos (de_funcionario_id);
create index if not exists memos_para_idx on public.memos (para_funcionario_id);

notify pgrst, 'reload schema';
