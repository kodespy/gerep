-- Búsqueda de auditoría incluyendo todo el JSON de payload
-- (PostgREST no permite payload::text dentro de .or()).

create or replace function public.search_audit_logs(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_app_id text default null,
  p_actor_id uuid default null,
  p_accion text default null,
  p_tabla text default null,
  p_q text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_pattern text := case when v_q is null then null else '%' || v_q || '%' end;
  v_total bigint;
  v_rows jsonb;
begin
  select count(*)::bigint into v_total
  from public.audit_logs a
  where a.created_at >= p_desde
    and a.created_at <= p_hasta
    and (p_app_id is null or a.app_id = p_app_id)
    and (p_actor_id is null or a.user_id = p_actor_id)
    and (p_accion is null or upper(a.action) = upper(p_accion))
    and (p_tabla is null or a.table_name = p_tabla)
    and (
      v_pattern is null
      or coalesce(a.description, '') ilike v_pattern
      or coalesce(a.table_name, '') ilike v_pattern
      or coalesce(a.action, '') ilike v_pattern
      or coalesce(a.ip_address::text, '') ilike v_pattern
      or coalesce(a.payload::text, '') ilike v_pattern
    );

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      a.id,
      a.created_at,
      a.user_id,
      a.table_name,
      a.action,
      a.description,
      a.ip_address,
      a.payload
    from public.audit_logs a
    where a.created_at >= p_desde
      and a.created_at <= p_hasta
      and (p_app_id is null or a.app_id = p_app_id)
      and (p_actor_id is null or a.user_id = p_actor_id)
      and (p_accion is null or upper(a.action) = upper(p_accion))
      and (p_tabla is null or a.table_name = p_tabla)
      and (
        v_pattern is null
        or coalesce(a.description, '') ilike v_pattern
        or coalesce(a.table_name, '') ilike v_pattern
        or coalesce(a.action, '') ilike v_pattern
        or coalesce(a.ip_address::text, '') ilike v_pattern
        or coalesce(a.payload::text, '') ilike v_pattern
      )
    order by a.created_at desc
    limit greatest(coalesce(p_limit, 50), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  ) t;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

grant execute on function public.search_audit_logs(
  timestamptz, timestamptz, text, uuid, text, text, text, int, int
) to authenticated;
