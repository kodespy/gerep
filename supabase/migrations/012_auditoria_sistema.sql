-- Auditoría de sistema: registro de altas/bajas/cambios y eventos de app.
-- Ejecutar en SQL Editor de Supabase.

create table if not exists public.auditoria_sistema (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users (id) on delete set null,
  accion text not null
    check (accion in ('insertar', 'actualizar', 'eliminar', 'login', 'logout', 'exportar', 'otro')),
  tabla text,
  registro_id text,
  resumen text,
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  meta jsonb
);

create index if not exists auditoria_sistema_created_at_idx
  on public.auditoria_sistema (created_at desc);

create index if not exists auditoria_sistema_actor_id_idx
  on public.auditoria_sistema (actor_id);

create index if not exists auditoria_sistema_tabla_idx
  on public.auditoria_sistema (tabla);

create index if not exists auditoria_sistema_accion_idx
  on public.auditoria_sistema (accion);

alter table public.auditoria_sistema enable row level security;

drop policy if exists "auditoria_sistema_select" on public.auditoria_sistema;
drop policy if exists "auditoria_sistema_insert" on public.auditoria_sistema;

-- Solo admin/dev leen la bitácora
create policy "auditoria_sistema_select"
  on public.auditoria_sistema for select
  to authenticated
  using (public.get_my_role() in ('administrador', 'desarrollador'));

-- Inserción desde app (login/logout) o triggers (security definer)
create policy "auditoria_sistema_insert"
  on public.auditoria_sistema for insert
  to authenticated
  with check (true);

grant select, insert on public.auditoria_sistema to authenticated;

-- Trigger genérico
create or replace function public.fn_auditoria_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id text;
  v_accion text;
  v_old jsonb;
  v_new jsonb;
  v_resumen text;
begin
  if TG_TABLE_NAME = 'auditoria_sistema' then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  if TG_OP = 'INSERT' then
    v_accion := 'insertar';
    v_new := to_jsonb(NEW);
    v_id := coalesce(NEW.id::text, null);
    v_resumen := format('Alta en %s', TG_TABLE_NAME);
    insert into public.auditoria_sistema (actor_id, accion, tabla, registro_id, resumen, datos_nuevos)
    values (v_actor, v_accion, TG_TABLE_NAME, v_id, v_resumen, v_new);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    v_accion := 'actualizar';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_id := coalesce(NEW.id::text, OLD.id::text, null);
    v_resumen := format('Actualización en %s', TG_TABLE_NAME);
    insert into public.auditoria_sistema (actor_id, accion, tabla, registro_id, resumen, datos_anteriores, datos_nuevos)
    values (v_actor, v_accion, TG_TABLE_NAME, v_id, v_resumen, v_old, v_new);
    return NEW;
  elsif TG_OP = 'DELETE' then
    v_accion := 'eliminar';
    v_old := to_jsonb(OLD);
    v_id := coalesce(OLD.id::text, null);
    v_resumen := format('Baja en %s', TG_TABLE_NAME);
    insert into public.auditoria_sistema (actor_id, accion, tabla, registro_id, resumen, datos_anteriores)
    values (v_actor, v_accion, TG_TABLE_NAME, v_id, v_resumen, v_old);
    return OLD;
  end if;

  return null;
end;
$$;

-- Adjuntar a tablas clave (idempotente)
do $$
declare
  t text;
  tables text[] := array[
    'profiles',
    'proyectos',
    'actas',
    'budget_commitments',
    'convenios',
    'resolutions',
    'expedientes',
    'expediente_seguimiento',
    'strs',
    'areas',
    'funcionarios',
    'usuario_modulos',
    'marcaciones',
    'configuracion_marcacion',
    'rendiciones',
    'devoluciones',
    'proveedores',
    'entidades'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('drop trigger if exists trg_auditoria_%I on public.%I', t, t);
      execute format(
        'create trigger trg_auditoria_%I
           after insert or update or delete on public.%I
           for each row execute function public.fn_auditoria_row()',
        t, t
      );
    end if;
  end loop;
end $$;
