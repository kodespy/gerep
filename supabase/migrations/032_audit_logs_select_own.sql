-- Permite a cada usuario leer sus propias actividades (perfil → Mis actividades).
-- Administradores y desarrolladores siguen viendo toda la bitácora.

do $$
begin
  if to_regclass('public.audit_logs') is not null then
    alter table public.audit_logs enable row level security;

    drop policy if exists "audit_logs_select_own_or_admin" on public.audit_logs;
    create policy "audit_logs_select_own_or_admin"
      on public.audit_logs for select
      to authenticated
      using (
        user_id = auth.uid()
        or public.get_my_role() in ('administrador', 'desarrollador')
      );
  end if;

  if to_regclass('public.auditoria_sistema') is not null then
    drop policy if exists "auditoria_sistema_select" on public.auditoria_sistema;
    create policy "auditoria_sistema_select"
      on public.auditoria_sistema for select
      to authenticated
      using (
        actor_id = auth.uid()
        or public.get_my_role() in ('administrador', 'desarrollador')
      );
  end if;
end $$;
