-- Aísla la bitácora por aplicación cuando varias apps comparten el mismo proyecto Supabase.
-- app_id de UEP Gestión de Proyectos: 'uep-proyectos'

do $$
begin
  if to_regclass('public.audit_logs') is null then
    raise notice 'audit_logs no existe; se omite 033_audit_logs_app_id';
    return;
  end if;

  alter table public.audit_logs
    add column if not exists app_id text;

  create index if not exists audit_logs_app_id_created_at_idx
    on public.audit_logs (app_id, created_at desc);

  -- Marcar eventos de esta app (por tablas propias) si aún no tienen app_id
  update public.audit_logs
  set app_id = 'uep-proyectos'
  where app_id is null
    and (
      table_name is null
      or table_name in (
        'auth',
        'profiles',
        'proyectos',
        'planes_financieros',
        'adendas',
        'actas',
        'acta_items',
        'actas_configuracion_registros',
        'budget_commitments',
        'convenios',
        'resolutions',
        'resolution_items',
        'resolution_proyectos',
        'expedientes',
        'expediente_seguimiento',
        'expediente_archivos',
        'strs',
        'str_archivos',
        'devoluciones',
        'rendiciones_cuentas',
        'rendicion_archivos',
        'proveedores',
        'entidades',
        'areas',
        'funcionarios',
        'usuario_modulos',
        'marcaciones',
        'configuracion_marcacion',
        'actividades',
        'programas',
        'componentes_programa',
        'objetos_de_gastos',
        'fuentes_financiamiento',
        'cronograma_financiero',
        'proyecto_control_formularios',
        'proyecto_informes_tecnicos',
        'proyecto_control_desembolsos'
      )
      or table_name like 'proyecto_%'
      or table_name like 'acta_%'
      or table_name like 'resolution_%'
      or table_name like 'expediente_%'
      or table_name like 'str_%'
      or table_name like 'rendicion%'
    );

  -- Default para inserts futuros desde triggers que no envían app_id
  alter table public.audit_logs
    alter column app_id set default 'uep-proyectos';
end $$;

-- Si existe una función trigger genérica, forzar app_id en inserts de esta app.
-- (Idempotente: solo redefine helpers usados por la app web.)
create or replace function public.audit_app_id_default()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.audit_app_id', true), ''),
    'uep-proyectos'
  );
$$;
