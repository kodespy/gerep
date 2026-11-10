-- Las tablas reales ya existen en uepdb:
--   public.configuracion_marcacion
--     (id, nombre_oficina, latitud_oficina, longitud_oficina, radio_tolerancia, user_id, created_at, updated_at)
--   public.marcaciones
--     (id, usuario_id, tipo, hora, latitud, longitud, created_at)
--
-- Esta migración queda como documentación; no crea tablas nuevas.
select 1;
