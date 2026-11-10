-- Configuración de registros para el módulo Actas
create table if not exists public.actas_configuracion_registros (
  id uuid primary key default gen_random_uuid(),
  fecha_desde date not null,
  fecha_hasta date not null,
  nro_resolucion text not null,
  resolucion_comite text,
  descripcion text,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint actas_configuracion_registros_rango_chk check (fecha_hasta >= fecha_desde)
);

create index if not exists actas_configuracion_registros_fecha_desde_idx
  on public.actas_configuracion_registros (fecha_desde desc);

alter table public.actas_configuracion_registros enable row level security;

drop policy if exists "actas_config_registros_select" on public.actas_configuracion_registros;
drop policy if exists "actas_config_registros_insert" on public.actas_configuracion_registros;
drop policy if exists "actas_config_registros_update" on public.actas_configuracion_registros;
drop policy if exists "actas_config_registros_delete" on public.actas_configuracion_registros;

create policy "actas_config_registros_select"
  on public.actas_configuracion_registros for select
  to authenticated
  using (true);

create policy "actas_config_registros_insert"
  on public.actas_configuracion_registros for insert
  to authenticated
  with check (true);

create policy "actas_config_registros_update"
  on public.actas_configuracion_registros for update
  to authenticated
  using (true)
  with check (true);

create policy "actas_config_registros_delete"
  on public.actas_configuracion_registros for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.actas_configuracion_registros to authenticated;
