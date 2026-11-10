-- Adenda opcional de un convenio + PDF firmado.
-- Ejecutar en SQL Editor de Supabase si el CLI no está vinculado.

alter table public.convenios
  add column if not exists adenda_numero text,
  add column if not exists fecha_adenda date,
  add column if not exists adenda_archivo_firmado text;

comment on column public.convenios.adenda_numero is 'Número de la adenda del convenio, si existe.';
comment on column public.convenios.fecha_adenda is 'Fecha de la adenda del convenio.';
comment on column public.convenios.adenda_archivo_firmado is 'Ruta del PDF firmado de la adenda en el bucket convenios_adjuntos.';
