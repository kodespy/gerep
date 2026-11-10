-- Roles / acceso por módulo por usuario
create table if not exists public.usuario_modulos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  modulo text not null,
  rol text not null default 'usuario'
    check (rol in ('usuario', 'administrador', 'desarrollador')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usuario_modulos_user_modulo_uq unique (user_id, modulo)
);

create index if not exists usuario_modulos_user_id_idx
  on public.usuario_modulos (user_id);

alter table public.usuario_modulos enable row level security;

drop policy if exists "usuario_modulos_select" on public.usuario_modulos;
drop policy if exists "usuario_modulos_insert" on public.usuario_modulos;
drop policy if exists "usuario_modulos_update" on public.usuario_modulos;
drop policy if exists "usuario_modulos_delete" on public.usuario_modulos;

-- Cada usuario ve sus módulos; admin/dev ven todos
create policy "usuario_modulos_select"
  on public.usuario_modulos for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.get_my_role() in ('administrador', 'desarrollador')
  );

create policy "usuario_modulos_insert"
  on public.usuario_modulos for insert
  to authenticated
  with check (public.get_my_role() in ('administrador', 'desarrollador'));

create policy "usuario_modulos_update"
  on public.usuario_modulos for update
  to authenticated
  using (public.get_my_role() in ('administrador', 'desarrollador'))
  with check (public.get_my_role() in ('administrador', 'desarrollador'));

create policy "usuario_modulos_delete"
  on public.usuario_modulos for delete
  to authenticated
  using (public.get_my_role() in ('administrador', 'desarrollador'));

grant select, insert, update, delete on public.usuario_modulos to authenticated;
