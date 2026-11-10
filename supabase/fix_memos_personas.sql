-- Nombre y cargo libres en De / Para / CC.
-- Ejecutar TODO el bloque en Supabase → SQL Editor.

alter table public.memos add column if not exists de_nombre text;
alter table public.memos add column if not exists de_cargo text;
alter table public.memos add column if not exists para_nombre text;
alter table public.memos add column if not exists para_cargo text;
alter table public.memos add column if not exists cc_personas jsonb;

alter table public.memos alter column cc_personas set default '[]'::jsonb;

update public.memos m
set de_nombre = coalesce(nullif(trim(m.de_nombre), ''), f.nombre_completo)
from public.funcionarios f
where m.de_funcionario_id = f.id
  and coalesce(nullif(trim(m.de_nombre), ''), '') = '';

update public.memos m
set de_cargo = coalesce(nullif(trim(m.de_cargo), ''), f.cargo)
from public.funcionarios f
where m.de_funcionario_id = f.id
  and coalesce(nullif(trim(m.de_cargo), ''), '') = '';

update public.memos m
set para_nombre = coalesce(nullif(trim(m.para_nombre), ''), f.nombre_completo)
from public.funcionarios f
where m.para_funcionario_id = f.id
  and coalesce(nullif(trim(m.para_nombre), ''), '') = '';

update public.memos m
set para_cargo = coalesce(nullif(trim(m.para_cargo), ''), f.cargo)
from public.funcionarios f
where m.para_funcionario_id = f.id
  and coalesce(nullif(trim(m.para_cargo), ''), '') = '';

update public.memos
set cc_personas = '[]'::jsonb
where cc_personas is null;

notify pgrst, 'reload schema';
