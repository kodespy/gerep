-- Permitir a administrador y desarrollador reabrir expedientes finalizados.
-- El mensaje "Solo los desarrolladores pueden reabrir..." sale de un trigger/función
-- remoto (no está en el frontend). Esta migración lo reemplaza y crea un RPC.
-- Ejecutar TODO el bloque en Supabase → SQL Editor.

create or replace function public.expedientes_rol_puede_reabrir()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select lower(trim(coalesce(p.role, '')))
    into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role is null or v_role = '' then
    v_role := lower(trim(coalesce(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role',
      ''
    )));
  end if;

  if (v_role is null or v_role = '')
     and to_regprocedure('public.get_my_role()') is not null then
    v_role := lower(trim(coalesce(public.get_my_role(), '')));
  end if;

  return v_role in ('administrador', 'desarrollador');
end;
$$;

revoke all on function public.expedientes_rol_puede_reabrir() from public;
grant execute on function public.expedientes_rol_puede_reabrir() to authenticated;

create or replace function public.expedientes_guard_reabrir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_final boolean;
  v_now_final boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  v_was_final :=
    coalesce(old.estado_finalizado, false)
    or lower(trim(coalesce(old.estado, ''))) = 'finalizado';

  v_now_final :=
    coalesce(new.estado_finalizado, false)
    or lower(trim(coalesce(new.estado, ''))) = 'finalizado';

  if v_was_final and not v_now_final then
    if not public.expedientes_rol_puede_reabrir() then
      raise exception 'Acceso denegado: Solo un administrador o un desarrollador puede reabrir expedientes finalizados.';
    end if;
  end if;

  return new;
end;
$$;

-- Reemplaza funciones existentes que bloquean la reapertura solo a desarrollador.
do $$
declare
  rec record;
begin
  for rec in
    select n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('pg_catalog', 'information_schema')
      and p.prokind = 'f'
      and p.prorettype = 'trigger'::regtype
      and pg_get_function_identity_arguments(p.oid) = ''
      and (
        p.prosrc ilike '%pueden reabrir%'
        or p.prosrc ilike '%reabrir expedientes%'
        or (
          p.prosrc ilike '%estado_finalizado%'
          and p.prosrc ilike '%desarrollador%'
          and p.prosrc ilike '%exception%'
        )
      )
  loop
    execute format(
      $sql$
      create or replace function %I.%I()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        v_was_final boolean;
        v_now_final boolean;
      begin
        if tg_op <> 'UPDATE' then
          return new;
        end if;
        v_was_final :=
          coalesce(old.estado_finalizado, false)
          or lower(trim(coalesce(old.estado, ''))) = 'finalizado';
        v_now_final :=
          coalesce(new.estado_finalizado, false)
          or lower(trim(coalesce(new.estado, ''))) = 'finalizado';
        if v_was_final and not v_now_final then
          if not public.expedientes_rol_puede_reabrir() then
            raise exception 'Acceso denegado: Solo un administrador o un desarrollador puede reabrir expedientes finalizados.';
          end if;
        end if;
        return new;
      end;
      $body$;
      $sql$,
      rec.nspname,
      rec.proname
    );
    raise notice 'Reemplazada función trigger %.%', rec.nspname, rec.proname;
  end loop;
end $$;

drop trigger if exists trg_expedientes_guard_reabrir on public.expedientes;
create trigger trg_expedientes_guard_reabrir
  before update on public.expedientes
  for each row
  execute procedure public.expedientes_guard_reabrir();

create or replace function public.reabrir_expediente(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if auth.uid() is null then
    raise exception 'Acceso denegado: sesión no válida.';
  end if;

  if not public.expedientes_rol_puede_reabrir() then
    raise exception 'Acceso denegado: Solo un administrador o un desarrollador puede reabrir expedientes finalizados.';
  end if;

  select e.estado into v_estado
  from public.expedientes e
  where e.id = p_id
  for update;

  if not found then
    raise exception 'Expediente no encontrado.';
  end if;

  begin
    perform set_config('session_replication_role', 'replica', true);
  exception when insufficient_privilege then
    null;
  end;

  update public.expedientes
  set
    estado_finalizado = false,
    estado = case
      when lower(trim(coalesce(estado, ''))) = 'finalizado' then 'En proceso'
      else estado
    end
  where id = p_id;
end;
$$;

revoke all on function public.reabrir_expediente(uuid) from public;
grant execute on function public.reabrir_expediente(uuid) to authenticated;
