-- Vincula funcionarios.user_id con el Usuario del sistema (profiles / auth.users).
-- Necesario para Recepcionar/Derivar y para el selector en RRHH → Funcionarios.

alter table public.funcionarios
  add column if not exists user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'funcionarios_user_id_fkey'
  ) then
    alter table public.funcionarios
      add constraint funcionarios_user_id_fkey
      foreign key (user_id) references public.profiles (id)
      on delete set null;
  end if;
end $$;

create index if not exists funcionarios_user_id_idx
  on public.funcionarios (user_id);
