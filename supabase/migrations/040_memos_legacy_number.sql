-- Compatibilidad: columna legado "number" (NOT NULL) vs "numero" de la app.
-- Ver supabase/fix_memos_number.sql

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'memos' and column_name = 'number'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'memos' and column_name = 'numero'
    ) then
      update public.memos
      set numero = coalesce(nullif(trim(numero), ''), nullif(trim("number"), ''))
      where coalesce(nullif(trim(numero), ''), '') = ''
        and coalesce(nullif(trim("number"), ''), '') <> '';

      update public.memos
      set "number" = numero
      where "number" is null and numero is not null;
    end if;
  end if;
end $$;

do $$
declare
  col text;
  keep text[] := array[
    'id', 'numero', 'fecha',
    'de_funcionario_id', 'para_funcionario_id',
    'de_nombre', 'de_cargo', 'para_nombre', 'para_cargo',
    'cc_funcionario_ids', 'cc_otros', 'cc_personas',
    'asunto', 'cuerpo', 'archivo_firmado',
    'created_by', 'created_at', 'updated_at'
  ];
begin
  for col in
    select c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'memos'
      and c.is_nullable = 'NO'
      and c.column_default is null
      and not (c.column_name = any (keep))
  loop
    execute format('alter table public.memos alter column %I drop not null', col);
  end loop;
end $$;

alter table public.memos drop column if exists "number";

notify pgrst, 'reload schema';
