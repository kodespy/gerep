-- Distinct de tablas / usuarios de auditoríaía (evita que el límite de filas deje solo "actas").

create or replace function public.list_audit_table_names(p_app_id text default null)
returns setof text
language sql
stable
security invoker
set search_path = public
as $$
  select distinct table_name
  from public.audit_logs
  where table_name is not null
    and table_name <> ''
    and (p_app_id is null or app_id = p_app_id)
  order by 1;
$$;

create or replace function public.list_audit_user_ids(p_app_id text default null)
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  select distinct user_id
  from public.audit_logs
  where user_id is not null
    and (p_app_id is null or app_id = p_app_id);
$$;

grant execute on function public.list_audit_table_names(text) to authenticated;
grant execute on function public.list_audit_user_ids(text) to authenticated;
