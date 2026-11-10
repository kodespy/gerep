-- Seed / completar ítems predefinidos STR según datos reales de str_documento_control.
-- Idempotente: no duplica descripciones ya existentes.

insert into public.str_control_items_predefinidos (orden, descripcion, activo)
select v.orden, v.descripcion, true
from (
  values
    (1,  'Carátula del Pedido Inicial'),
    (2,  'Nota Inicial de Solicitud de Proyecto o Solicitud de Desembolso)'),
    (3,  'Proyecto Original)'),
    (4,  'Acta Extraordinaria del Comité (Acta de Directorio)'),
    (5,  'Formulario de Verificación de Legajo de Proyecto o Proveedor'),
    (6,  'Acta del Comité Evaluador de Proyectos'),
    (7,  'Memorándum de Solicitud de Pago'),
    (8,  'Providencia de Remisión de la DGAF para Resolución'),
    (9,  'Resolución de Aprobación de Proyecto'),
    (10, 'Resolución de Autorización de Desembolso'),
    (11, 'Convenio'),
    (12, 'Factura'),
    (13, 'Solicitud de Transferencia de Recursos (STR)'),
    (14, 'Recibo de Dinero'),
    (15, 'Formulario 02 Rendición de Cuentas'),
    (16, 'Otros documentos respaldatorios')
) as v(orden, descripcion)
where not exists (
  select 1
  from public.str_control_items_predefinidos p
  where trim(both from p.descripcion) = trim(both from v.descripcion)
);
