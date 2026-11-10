-- Control documental de STR:
-- - Catálogo: str_control_items_predefinidos (configuración del sistema)
-- - Formularios por STR: tabla YA existente public.str_documento_control
--   (columnas base: id, str_id, documento, observaciones, user_id, created_at, updated_at)

-- Catálogo de ítems predefinidos
create table if not exists public.str_control_items_predefinidos (
  id uuid primary key default gen_random_uuid(),
  orden integer not null default 1,
  descripcion text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Extender la tabla existente con columnas del formulario de control
alter table public.str_documento_control
  add column if not exists numero_formulario text;

alter table public.str_documento_control
  add column if not exists cumple boolean default false;

alter table public.str_documento_control
  add column if not exists no_cumple boolean default false;

alter table public.str_documento_control
  add column if not exists no_aplica boolean default false;

alter table public.str_documento_control
  add column if not exists fecha date;

alter table public.str_documento_control
  add column if not exists archivo_firmado text;

create index if not exists str_documento_control_str_id_idx
  on public.str_documento_control (str_id);

create index if not exists str_documento_control_numero_idx
  on public.str_documento_control (numero_formulario);

alter table public.str_control_items_predefinidos enable row level security;
alter table public.str_documento_control enable row level security;

drop policy if exists "str_control_items_predefinidos_all" on public.str_control_items_predefinidos;
create policy "str_control_items_predefinidos_all"
  on public.str_control_items_predefinidos for all
  to authenticated
  using (true) with check (true);

drop policy if exists "str_documento_control_all" on public.str_documento_control;
create policy "str_documento_control_all"
  on public.str_documento_control for all
  to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.str_control_items_predefinidos to authenticated;
grant select, insert, update, delete on public.str_documento_control to authenticated;

-- Si se creó la tabla provisional del módulo, migrar filas (si hubiera) y eliminarla
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'str_control_formularios'
  ) then
    execute $m$
      insert into public.str_documento_control (
        str_id, numero_formulario, documento, cumple, no_cumple, no_aplica,
        observaciones, fecha, archivo_firmado, user_id, created_at, updated_at
      )
      select
        str_id, numero_formulario, descripcion, cumple, no_cumple, no_aplica,
        observaciones, fecha, archivo_firmado, user_id, created_at, updated_at
      from public.str_control_formularios
      where not exists (
        select 1 from public.str_documento_control d
        where d.id = str_control_formularios.id
      )
    $m$;
    drop table public.str_control_formularios;
  end if;
end $$;

-- Ítems iniciales (solo si el catálogo está vacío)
insert into public.str_control_items_predefinidos (orden, descripcion, activo)
select v.orden, v.descripcion, true
from (
  values
    (1,  'Carátula del Pedido Inicial'),
    (2,  'Nota Inicial de Solicitud de Proyecto o Solicitud de Desembolso'),
    (3,  'Proyecto Original'),
    (4,  'Acta Extraordinaria del Comité (Acta de Directorio)'),
    (5,  'Formulario de Verificación de Legajo de Proyecto o Proveedor'),
    (6,  'Acta del Comité Evaluador de Proyectos'),
    (7,  'Memorándum de Solicitud de Pago'),
    (8,  'Providencia de Remisión de la DGAF para Resolución'),
    (9,  'Resolución de Aprobación de Proyecto'),
    (10, 'Resolución de Autorización de Desembolso'),
    (11, 'Convenio Firmada'),
    (12, 'Factura'),
    (13, 'Solicitud de Transferencia de Recursos (STR) - Firmada'),
    (14, 'Recibo de Dinero'),
    (15, 'Formulario 02 Rendición de Cuentas')
) as v(orden, descripcion)
where not exists (select 1 from public.str_control_items_predefinidos limit 1);

insert into storage.buckets (id, name, public)
values ('str-control-formularios', 'str-control-formularios', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "str_control_formularios_auth_select" on storage.objects;
drop policy if exists "str_control_formularios_auth_insert" on storage.objects;
drop policy if exists "str_control_formularios_auth_update" on storage.objects;
drop policy if exists "str_control_formularios_auth_delete" on storage.objects;

create policy "str_control_formularios_auth_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'str-control-formularios');

create policy "str_control_formularios_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'str-control-formularios');

create policy "str_control_formularios_auth_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'str-control-formularios');

create policy "str_control_formularios_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'str-control-formularios');
