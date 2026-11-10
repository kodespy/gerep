/**
 * Genera docs/entrega/ERS-GEREP-v1.0.docx
 * Especificación de Requisitos de Software — estilo administración pública.
 * Contenido alineado al código de GEREP (módulos, tablas, FKs, roles).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'docs', 'entrega')
const OUT_FILE = path.join(OUT_DIR, 'ERS-GEREP-v1.0.docx')

const NAVY = '1B3A4B'
const MUTED = '5C6B7A'
const LINE = 'C5CDD6'
const HEAD_BG = '1B3A4B'
const ROW_ALT = 'F3F5F7'
const WHITE = 'FFFFFF'
const PAGE_W = 9360

const noBorder = { style: BorderStyle.NONE, size: 0, color: WHITE }
const thin = { style: BorderStyle.SINGLE, size: 4, color: LINE }
const borders = { top: thin, bottom: thin, left: thin, right: thin }

function r(text, o = {}) {
  return new TextRun({
    text: text ?? '',
    font: o.font ?? 'Calibri',
    size: o.size ?? 22,
    bold: !!o.bold,
    italics: !!o.italics,
    color: o.color ?? '222222',
    underline: o.underline ? {} : undefined,
  })
}

function para(text, o = {}) {
  const runs = Array.isArray(text) ? text : [r(text, o.run ?? {})]
  return new Paragraph({
    spacing: { after: o.after ?? 160, before: o.before ?? 0, line: o.line ?? 276 },
    alignment: o.align ?? AlignmentType.JUSTIFIED,
    indent: o.indent,
    children: runs,
  })
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY, space: 4 } },
    children: [r(text, { bold: true, size: 32, color: NAVY })],
  })
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [r(text, { bold: true, size: 26, color: NAVY })],
  })
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [r(text, { bold: true, size: 24, color: '2F4A5C' })],
  })
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 80 },
    children: [r(text, { size: 21 })],
  })
}

function cell(text, o = {}) {
  const width = o.w ?? Math.round(PAGE_W / (o.cols || 4))
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: o.header ? { type: ShadingType.CLEAR, fill: HEAD_BG } : o.alt ? { type: ShadingType.CLEAR, fill: ROW_ALT } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: o.align ?? AlignmentType.LEFT,
        children: [r(String(text ?? ''), { size: o.size ?? 18, bold: !!o.header || !!o.bold, color: o.header ? WHITE : '222222' })],
      }),
    ],
  })
}

function table(headers, rows) {
  const cols = headers.length
  const widths = headers.map((_, i) => {
    if (cols === 2) return i === 0 ? 2800 : PAGE_W - 2800
    if (cols === 3) return i === 0 ? 2200 : Math.round((PAGE_W - 2200) / 2)
    if (cols === 4) return [2000, 2400, 2200, 2760][i]
    if (cols === 5) return [1600, 1800, 2000, 1800, 2160][i]
    return Math.round(PAGE_W / cols)
  })
  const head = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => cell(h, { header: true, w: widths[i], cols })),
  })
  const body = rows.map((row, ri) => new TableRow({
    children: row.map((c, i) => cell(c, { alt: ri % 2 === 1, w: widths[i], cols })),
  }))
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [head, ...body],
  })
}

function kvTable(pairs) {
  return table(['Campo', 'Valor'], pairs)
}

function caption(text) {
  return para(text, { after: 220, run: { size: 18, italics: true, color: MUTED }, align: AlignmentType.LEFT })
}

function noteUpdateToc() {
  return para(
    'Nota: al abrir el archivo en Microsoft Word, haga clic derecho sobre el índice y seleccione «Actualizar campos» / «Actualizar toda la tabla».',
    { run: { size: 18, italics: true, color: MUTED }, after: 280 },
  )
}

function pageBreak() {
  return new Paragraph({ children: [r('')], pageBreakBefore: true })
}

/* -------------------------------------------------------------------------- */
/* Inventario alineado al código                                               */
/* -------------------------------------------------------------------------- */

const CONTROL = {
  producto: 'GEREP · Gestión de Recursos Públicos',
  version: '1.0.0',
  fecha: '16 de septiembre de 2026',
  codigo: 'ERS-GEREP-1.0',
  cliente: 'Unidad Ejecutora de Proyectos (UEP)',
  clasificacion: 'Uso interno — entrega contractual',
  norma: 'ISO/IEC/IEEE 29148 e IEEE 830 (adaptadas)',
  url: 'https://uep.kodespy.app',
  stack: 'Vite 7 · React 19 · TypeScript · Tailwind CSS 4 · React Router 8 · Supabase (PostgreSQL, Auth, Storage, RLS) · Hostinger Node.js 20',
}

const GLOSARIO = [
  ['GEREP', 'Gestión de Recursos Públicos. Nombre de la aplicación.'],
  ['UEP', 'Unidad Ejecutora de Proyectos.'],
  ['STR', 'Solicitud de Transferencia de Recursos (pago / desembolso).'],
  ['CDP', 'Certificado de Disponibilidad Presupuestaria (tabla budget_commitments).'],
  ['OG', 'Objeto de gasto (catálogo presupuestario).'],
  ['FF', 'Fuente de financiamiento.'],
  ['CGR', 'Contraloría General de la República (marco de rendición de cuentas).'],
  ['RLS', 'Row Level Security de PostgreSQL / Supabase.'],
  ['FK', 'Clave foránea (integridad referencial).'],
  ['SPA', 'Single Page Application (interfaz web).'],
  ['BaaS', 'Backend as a Service (Supabase).'],
  ['CRUD', 'Alta, consulta, modificación y baja de registros.'],
]

const ACTORES = [
  ['Usuario autenticado', 'Accede a módulos habilitados. Si no tiene filas en usuario_modulos, ve el menú general (compatibilidad).'],
  ['Administrador', 'Acceso pleno a RRHH y Sistema. Puede reabrir expedientes finalizados y eliminar movimientos de historial.'],
  ['Desarrollador', 'Mismos privilegios elevados que administrador (RRHH, Sistema, reapertura, carga masiva de memos).'],
  ['Responsable de área', 'Funcionario vinculado a un área; recepciona y deriva expedientes de su dependencia.'],
  ['Sistema (Supabase)', 'Aplica RLS, triggers, Storage y auditoría.'],
]

const MODULOS = [
  ['dashboard', 'Panel de control', 'General', '/', 'KPIs, cadena de ejecución y accesos.'],
  ['expedientes', 'Expedientes', 'General', '/expedientes', 'Mesa de entrada: alta, derivación, recepción, finalización.'],
  ['memos', 'Memos', 'General', '/memos', 'Memorándums UEP, PDF, adjunto firmado, carga masiva (dev).'],
  ['actividades', 'Actividades', 'Planificación', '/planificacion/actividades', 'Catálogo de actividades presupuestarias.'],
  ['programas', 'Estructura programática', 'Planificación', '/planificacion/programas', 'Árbol de 6 niveles SNIP.'],
  ['planes_admin', 'Planes administrativos', 'Planificación', '/planificacion/planes-administrativos', 'Presupuesto administrativo, cronograma y modificaciones.'],
  ['proyectos', 'Proyectos', 'Ejecución', '/proyectos', 'Listado y ficha 360° del proyecto.'],
  ['cdp', 'CDP', 'Ejecución', '/cdp', 'Compromisos presupuestarios.'],
  ['actas', 'Actas', 'Ejecución', '/actas', 'Actas de desembolso e ítems.'],
  ['resoluciones', 'Resoluciones', 'Ejecución', '/resoluciones', 'Resoluciones, ítems y proyectos vinculados.'],
  ['convenios', 'Convenios', 'Ejecución', '/convenios', 'Convenios y adjuntos.'],
  ['str', 'STR · Solicitudes', 'Pagos', '/pagos/str', 'Solicitudes de transferencia de recursos.'],
  ['devoluciones', 'Devoluciones', 'Pagos', '/pagos/devoluciones', 'Devoluciones asociadas a STR.'],
  ['rendiciones', 'Rendiciones de cuentas', 'Rendición', '/rendiciones', 'Rendiciones CGR, control y adjuntos.'],
  ['informes_admin_fin', 'Informes admin. y financieros', 'Informes', '/informes/admin-financieros', 'Cartera 360, pulso, cadena, radar CGR, etc.'],
  ['asistente_informes', 'Asistente de informes', 'Informes', '/informes/asistente', 'Informes en lenguaje natural (PDF/Excel/Word).'],
  ['entidades', 'Entidades', 'Catálogos', '/catalogos/entidades', 'Remitentes de expedientes.'],
  ['proveedores', 'Proveedores', 'Catálogos', '/catalogos/proveedores', 'Proveedores / beneficiarios.'],
  ['fuentes', 'Fuentes de financiamiento', 'Catálogos', '/catalogos/fuentes', 'FF 10, 20, 30…'],
  ['objetos_gasto', 'Objetos de gasto', 'Catálogos', '/catalogos/objetos-gasto', 'OG con jerarquía opcional.'],
  ['areas', 'Áreas', 'RRHH', '/catalogos/areas', 'Dependencias internas/externas.'],
  ['funcionarios', 'Funcionarios', 'RRHH', '/catalogos/funcionarios', 'Nómina y vínculo a usuario.'],
  ['marcaciones', 'Reporte de marcaciones', 'RRHH', '/marcaciones', 'Asistencia con geocerca.'],
  ['usuarios', 'Usuarios', 'Sistema', '/usuarios', 'Cuentas, roles y módulos.'],
  ['auditoria', 'Auditoría', 'Sistema', '/auditoria', 'Bitácora de acciones.'],
  ['control_documental_proyectos', 'Control documental de proyectos', 'Sistema', '/sistema/control-documental-proyectos', 'Checklist de proyectos.'],
  ['control_documental_str', 'Control documental de STR', 'Sistema', '/sistema/control-documental-str', 'Checklist de STR.'],
  ['control_rendiciones_cuentas', 'Control de rendiciones', 'Sistema', '/sistema/control-rendiciones-cuentas', 'Checklist de rendiciones.'],
  ['perfil', 'Mi perfil', 'General', '/perfil', 'Datos del usuario autenticado.'],
  ['documentaciones', 'Documentaciones', 'General', '/documentaciones', 'Manuales paso a paso en PDF.'],
]

const RFS = [
  {
    id: 'RF-001', titulo: 'Autenticación y sesión', modulo: 'Login / Perfil', ruta: '/login, /perfil',
    actores: 'Todos',
    desc: 'El sistema autentica usuarios mediante Supabase Auth (correo y contraseña). Sin sesión, redirige a /login. El perfil se lee de profiles (nombre, rol, correo, avatar, teléfono, dirección).',
    flujo: 'Ingresar credenciales → JWT de sesión → cargar profiles y usuario_modulos → menú según rol y módulos.',
    reglas: 'Contraseña con reglas de complejidad en alta de usuarios. Cerrar sesión invalida la sesión local.',
    datos: 'auth.users, profiles, usuario_modulos. Storage: avatars.',
    excepciones: 'Credenciales inválidas; usuario bloqueado (is_blocked).',
  },
  {
    id: 'RF-002', titulo: 'Panel de control', modulo: 'dashboard', ruta: '/',
    actores: 'Autenticados con acceso al módulo',
    desc: 'Vista de inicio con contadores de la cadena de ejecución (actividades, programas, proyectos, planes, CDP, actas, convenios, STR, rendiciones) y expedientes no finalizados.',
    flujo: 'Abrir inicio → consultar conteos → navegar a cada módulo.',
    reglas: 'Los indicadores respetan RLS del usuario.',
    datos: 'Lectura agregada de tablas de la cadena.',
    excepciones: 'Error de red / sesión vencida.',
  },
  {
    id: 'RF-003', titulo: 'Búsqueda global, tema y usuarios en línea', modulo: 'General', ruta: 'Layout',
    actores: 'Autenticados',
    desc: 'El encabezado ofrece búsqueda, cambio de tema, notificaciones y usuarios en línea.',
    flujo: 'Escribir término → filtrar módulos/registros según implementación → abrir destino.',
    reglas: 'No expone módulos a los que el usuario no tiene acceso.',
    datos: 'Preferencias locales; presencia en línea.',
    excepciones: 'Sin resultados.',
  },
  {
    id: 'RF-004', titulo: 'Registrar y consultar expedientes', modulo: 'expedientes', ruta: '/expedientes',
    actores: 'Usuarios con módulo expedientes',
    desc: 'Mesa de entrada: número correlativo, fecha de recepción, tipo (General o Rendición de Cuentas), asunto, entidad remitente, estado y flag estado_finalizado.',
    flujo: 'Nuevo → se propone número → completar datos → guardar. Listado con filtros (estado, tipo, trámite/finalizado), paginación y ficha /expedientes/:id.',
    reglas: 'Asunto en mayúsculas al guardar. Tipo Rendición de Cuentas exige STR, monto y observaciones (OT y fecha de transferencia desde fecha_desembolso).',
    datos: 'expedientes (tipo, datos_rendicion jsonb), entidades.',
    excepciones: 'Falta migración 043 (columnas tipo/datos_rendicion).',
  },
  {
    id: 'RF-005', titulo: 'Derivar, recepcionar y seguimiento de expedientes', modulo: 'expedientes', ruta: '/expedientes/:id',
    actores: 'Responsable de área; admin/dev en excepciones de recepción externa',
    desc: 'Workflow: Inicio de trámite → Derivar → Recibir (área destino) → En proceso. Recepción en área externa y retorno a área interna. Historial en expediente_seguimiento. Desarrollo (fecha + descripción) solo del responsable del área que tiene el expediente ya recepcionado.',
    flujo: 'Derivar (área destino + observación) → aviso al responsable → recepción → opcional desarrollo → nueva derivación. Situación actual del área (situacion_actual).',
    reglas: 'No se deriva un expediente finalizado. Recepción interna: responsable del área destino. Recepción externa: área que derivó o admin/dev.',
    datos: 'expediente_seguimiento, expediente_desarrollos, areas, funcionarios, profiles.',
    excepciones: 'Usuario sin área asociada; expediente finalizado.',
  },
  {
    id: 'RF-006', titulo: 'Finalizar y reabrir expedientes', modulo: 'expedientes', ruta: '/expedientes/:id',
    actores: 'Usuarios (finalizar); Administrador o Desarrollador (reabrir)',
    desc: 'Se marca estado_finalizado y/o estado Finalizado. La reapertura deja estado_finalizado=false y, si el estado era Finalizado, pasa a En proceso. Front y base deben permitir admin y desarrollador.',
    flujo: 'Marcar finalizado → confirmar. Reactivar → RPC reabrir_expediente o UPDATE controlado.',
    reglas: 'Usuarios comunes no pueden quitar el flag. Trigger de BD debe leer profiles.role (no el JWT role=authenticated).',
    datos: 'expedientes; función reabrir_expediente; get_my_role / expedientes_rol_puede_reabrir.',
    excepciones: 'Si no se aplicó 044_expedientes_reabrir_admin_dev.sql, la BD rechaza con «Solo los desarrolladores pueden reabrir…».',
  },
  {
    id: 'RF-007', titulo: 'Adjuntos y constancia de rendición en expedientes', modulo: 'expedientes', ruta: '/expedientes/:id',
    actores: 'Usuarios con acceso al expediente',
    desc: 'Adjuntos en Storage expedientes_adjuntos. Expediente de rendición: selector de STR, parseo de formulario adjunto, constancia PDF de recepción con QR (datos impresos y payload de plazo).',
    flujo: 'Adjuntar archivo → listar/descargar. Tipo rendición → elegir STR → generar constancia.',
    reglas: 'El selector de STR debe listar el universo de STR (fetchAll). Constancia: no imprime firma; QR incluye fecha límite y plazo vs fecha_recepcion.',
    datos: 'expediente_adjuntos, strs, datos_rendicion.',
    excepciones: 'STR inexistente; Storage no disponible.',
  },
  {
    id: 'RF-008', titulo: 'Memorándums UEP', modulo: 'memos', ruta: '/memos',
    actores: 'Usuarios; carga masiva solo desarrollador',
    desc: 'Alta de memo con número sugerido (001/AAAA), De/Para/CC (texto o catálogo de funcionarios), asunto, cuerpo enriquecido (imágenes), PDF institucional, adjunto firmado (bloquea regenerar PDF de trabajo), duplicar, carga masiva .docx.',
    flujo: 'Nuevo → editar → imprimir PDF → adjuntar firmado. Dev: carga masiva omite N° existentes.',
    reglas: 'created_by = usuario. N° único por serie. Firmado impide regenerar PDF de trabajo.',
    datos: 'memos, funcionarios, areas. Bucket memo-archivos.',
    excepciones: 'Número duplicado; DOCX ilegible.',
  },
  {
    id: 'RF-009', titulo: 'Actividades y estructura programática', modulo: 'actividades / programas', ruta: '/planificacion/actividades, /planificacion/programas',
    actores: 'Usuarios con módulos de planificación',
    desc: 'CRUD de actividades. Explorador jerárquico: Programa → Componente → Subcomponente → Ítem → Subítem → Presupuesto anual, con montos consolidados y ABM por nivel.',
    flujo: 'Elegir actividad → navegar árbol → crear/editar/eliminar nodo si no hay hijos que lo impidan.',
    reglas: 'deleteGuard bloquea baja con dependencias. Códigos y descripciones obligatorios según formulario.',
    datos: 'actividades, programas, componentes_programa, subcomponentes_programa, items_programa, subitems_programa, presupuestos_programa.',
    excepciones: 'Violación de FK al eliminar.',
  },
  {
    id: 'RF-010', titulo: 'Planes financieros administrativos', modulo: 'planes_admin', ruta: '/planificacion/planes-administrativos',
    actores: 'Usuarios con el módulo',
    desc: 'Plan anual por programa, actividad, OG y fuente. Calcula presupuesto inicial, modificaciones netas, vigente, comprometido (CDP) y saldo. Cronograma mensual y modificaciones. PDF consolidado (CDP anulados no suman).',
    flujo: 'Alta del plan → cronograma → modificaciones → exportar PDF.',
    reglas: 'Modificaciones aumentan o disminuyen el vigente. CDP anulado no entra en ejecución.',
    datos: 'planes_financieros_administrativos, cronograma_administrativo, modificaciones_administrativas, budget_commitments (vínculo por proyecto/plan).',
    excepciones: 'Saldo negativo (se muestra, no se oculta).',
  },
  {
    id: 'RF-011', titulo: 'Proyectos — listado y ficha 360°', modulo: 'proyectos', ruta: '/proyectos, /proyectos/:id',
    actores: 'Usuarios con módulo proyectos',
    desc: 'Alta: descripción, monto, componente, expediente de origen, mes/año. Listado cards/lista con avance de desembolso. Ficha 360°: pipeline (plan, CDP, actas, resoluciones, convenios, STR, devoluciones, rendiciones), control documental, informe técnico, control de desembolsos, archivos, documentos.',
    flujo: 'Crear → abrir 360° → operar pestañas con proyecto fijado. Exportar Excel/PDF del listado.',
    reglas: 'No eliminar proyecto con hijos (planes, CDP, actas, resoluciones, convenios, STR, adjuntos, controles, informes). Expediente de origen lista todos los expedientes (fecha_recepcion desc).',
    datos: 'proyectos, planes_financieros, adendas, cronograma_financiero, budget_commitments, actas, resolution_proyectos, convenios, strs, proyecto_adjuntos, proyecto_control_formularios, proyecto_informes_tecnicos, proyecto_control_desembolsos.',
    excepciones: 'Componente o expediente inexistente.',
  },
  {
    id: 'RF-012', titulo: 'Plan financiero del proyecto, adendas y cronograma', modulo: 'proyectos (embebido)', ruta: '/proyectos/:id',
    actores: 'Usuarios con acceso al proyecto',
    desc: 'Líneas de plan (proveedor, OG, fuente, monto). Adendas de aumento/disminución. Cronograma mensual. Ítems de actas pueden referenciar plan o adenda.',
    flujo: 'Cargar líneas → adendas → distribución mensual.',
    reglas: 'Adendas rechazadas/anuladas no ajustan el vigente. deleteGuard sobre plan y adenda.',
    datos: 'planes_financieros, adendas, cronograma_financiero, proveedores, objetos_de_gastos, fuentes_financiamiento.',
    excepciones: 'Proveedor/OG/fuente no seleccionados.',
  },
  {
    id: 'RF-013', titulo: 'CDP', modulo: 'cdp', ruta: '/cdp',
    actores: 'Usuarios del módulo',
    desc: 'Certificados de disponibilidad: número correlativo, fecha, monto, estado activo/anulado, usuario. Compromiso anterior visible en el formulario. PDF del CDP. Anulados no suman en resúmenes.',
    flujo: 'Nuevo (número sugerido) → guardar → descargar PDF.',
    reglas: 'tipo_movimiento=Compromiso por defecto. user_id del creador.',
    datos: 'budget_commitments, proyectos, profiles.',
    excepciones: 'Número duplicado según restricción de BD.',
  },
  {
    id: 'RF-014', titulo: 'Actas de desembolso', modulo: 'actas', ruta: '/actas',
    actores: 'Usuarios del módulo',
    desc: 'Acta con número, fechas/horas, formulario de control, montos, estado, archivo firmado, ítems (plan o adenda). Unificación de OG en PDF; filas de adenda aparte. Monto aprobado de plan = plan+adendas del OG; de adenda = ajuste de esa adenda.',
    flujo: 'Crear acta → ítems → PDF → adjuntar firmado.',
    reglas: 'Ítems requieren plan_financiero_id; adenda_id opcional. Estados según check de BD. No borrar acta con STR vinculados.',
    datos: 'actas, acta_items, planes_financieros, adendas, proyectos. Bucket acta-archivos.',
    excepciones: 'Columna adenda_id ausente (migración 042).',
  },
  {
    id: 'RF-015', titulo: 'Resoluciones', modulo: 'resoluciones', ruta: '/resoluciones',
    actores: 'Usuarios del módulo',
    desc: 'Resolución con tipo (aprobación vs plan presupuestario). Ítems por OG y monto. Vínculo N:N con proyectos (resolution_proyectos). STR se imputan a un ítem del plan; no aplica a resoluciones solo aprobación. Saldos ejecutado/disponible.',
    flujo: 'Alta → ítems y proyectos → usar en STR.',
    reglas: 'No eliminar resolución con ítems, proyectos o STR. prepareStrResolucionPayload impide saldo negativo al pagar.',
    datos: 'resolutions, resolution_items, resolution_proyectos, strs.',
    excepciones: 'Tipo solo aprobación no admite plan de ítems para STR.',
  },
  {
    id: 'RF-016', titulo: 'Convenios', modulo: 'convenios', ruta: '/convenios',
    actores: 'Usuarios del módulo',
    desc: 'Convenios asociados a proyecto, con adjuntos en Storage.',
    flujo: 'Registrar → adjuntar → consultar.',
    reglas: 'proyecto_id requerido en modo embebido. No borrar proyecto con convenios.',
    datos: 'convenios. Bucket convenios_adjuntos.',
    excepciones: 'Bucket inexistente.',
  },
  {
    id: 'RF-017', titulo: 'STR · Solicitudes de transferencia', modulo: 'str', ruta: '/pagos/str',
    actores: 'Usuarios del módulo',
    desc: 'STR con número, fecha, proyecto, resolución e ítem de plan, acta opcional, fuente, OG, montos, OT, fechas de desembolso y rendición, adjuntos y formulario de control documental. Filtros por actividad/programa/componente. PDF consolidado. Límite alto de filas (50.000) para no truncar totales.',
    flujo: 'Seleccionar resolución con plan → ítem con saldo → monto ≤ saldo → guardar → adjuntos/control → PDF.',
    reglas: 'Cada STR se vincula a una línea del plan de una resolución. Saldo negativo bloquea el envío. Devoluciones y rendiciones reducen/controlan el saldo a rendir.',
    datos: 'strs, str_archivos, str_documento_control, resolutions, resolution_items, actas, proyectos, fuentes_financiamiento, objetos_de_gastos.',
    excepciones: 'Resolución sin ítems; saldo insuficiente.',
  },
  {
    id: 'RF-018', titulo: 'Devoluciones', modulo: 'devoluciones', ruta: '/pagos/devoluciones',
    actores: 'Usuarios del módulo',
    desc: 'Registro de devoluciones de fondos ligadas a un STR y OG, que afectan saldos netos de pago y rendición.',
    flujo: 'Elegir STR → monto y OG → guardar.',
    reglas: 'No eliminar STR con devoluciones.',
    datos: 'devoluciones, strs, objetos_de_gastos.',
    excepciones: 'STR inexistente.',
  },
  {
    id: 'RF-019', titulo: 'Rendiciones de cuentas', modulo: 'rendiciones', ruta: '/rendiciones',
    actores: 'Usuarios del módulo',
    desc: 'Rendición vinculada a STR (y opcionalmente expediente). Estados, plazos, saldo a rendir, adjuntos y formularios de control RC. Vista de formularios y PDF.',
    flujo: 'Alta desde STR → completar → adjuntos → formulario de control.',
    reglas: 'Check de estado en BD. No eliminar STR/rendición con hijos. Días de atraso vs fecha_rendicion.',
    datos: 'rendiciones_cuentas, rendicion_archivos, rendicion_control_formularios, strs, expedientes.',
    excepciones: 'Estado no permitido por constraint.',
  },
  {
    id: 'RF-020', titulo: 'Informes administrativos y financieros', modulo: 'informes_admin_fin', ruta: '/informes/admin-financieros',
    actores: 'Usuarios del módulo',
    desc: 'Informes: Cartera 360°, Pulso del mes, Cadena de ejecución, Acta·Resolución·STR, Mapa OG×FF, Radar CGR, Cronómetro vs real, Plan vs STR. Filtros de periodo y estructura. Exportación PDF/Excel.',
    flujo: 'Elegir informe → filtros → generar → descargar.',
    reglas: 'CDP anulados no entran en totales de ejecución. STR neto considera devoluciones.',
    datos: 'Lecturas agregadas de proyectos, planes, CDP, actas, STR, rendiciones, OG, FF.',
    excepciones: 'Sin datos en el periodo.',
  },
  {
    id: 'RF-021', titulo: 'Asistente de informes', modulo: 'asistente_informes', ruta: '/informes/asistente',
    actores: 'Usuarios; algunos informes adminOnly',
    desc: 'Pedido en lenguaje natural. Detecta plantilla (expedientes, STR, proyectos, auditoría, informes admin) y formato PDF/Excel/Word.',
    flujo: 'Escribir pedido → interpretar → consultar → descargar.',
    reglas: 'Auditoría y ciertos informes requieren administrador o desarrollador. OpenAI opcional (VITE_OPENAI_API_KEY) solo para refinar interpretación; no es obligatorio.',
    datos: 'Según plantilla.',
    excepciones: 'Pedido ambiguo; rol insuficiente.',
  },
  {
    id: 'RF-022', titulo: 'Catálogos maestros', modulo: 'entidades, proveedores, fuentes, objetos_gasto', ruta: '/catalogos/*',
    actores: 'Usuarios con cada módulo',
    desc: 'Entidades (razón social, RUC, contacto). Proveedores (RUC con lookup TURUC, razón social). Fuentes (descripción FF, detalle). OG (código, descripción, og_principal_id jerárquico).',
    flujo: 'CRUD estándar con búsqueda.',
    reglas: 'No eliminar proveedores/OG/fuentes con planes, STR, devoluciones o ítems de resolución.',
    datos: 'entidades, proveedores, fuentes_financiamiento, objetos_de_gastos.',
    excepciones: 'FK 23503 al borrar.',
  },
  {
    id: 'RF-023', titulo: 'Áreas y funcionarios', modulo: 'areas, funcionarios', ruta: '/catalogos/areas, /catalogos/funcionarios',
    actores: 'Administrador o desarrollador (RRHH)',
    desc: 'Áreas internas/externas, área padre, funciones (lista), responsable. Funcionarios: documento, cargo, área, user_id para recepcionar/derivar con su cuenta.',
    flujo: 'Definir organigrama → cargar funcionarios → asociar usuario.',
    reglas: 'canAccessRrhh. Memos referencian funcionarios De/Para.',
    datos: 'areas, funcionarios, profiles.',
    excepciones: 'Acceso denegado a rol usuario.',
  },
  {
    id: 'RF-024', titulo: 'Marcaciones y geocerca', modulo: 'marcaciones', ruta: '/marcaciones',
    actores: 'Usuarios (marcar); admin/dev (configurar sede)',
    desc: 'Entrada/salida con geolocalización. Configuración de sede (lat, lng, radio). Reporte por fechas y PDF/Excel.',
    flujo: 'Marcar si está dentro de geocerca → consultar reporte.',
    reglas: 'canConfigureAsistencia para la geocerca. Hora de pared local.',
    datos: 'marcaciones, configuracion_marcacion, profiles.',
    excepciones: 'Fuera de geocerca; GPS denegado.',
  },
  {
    id: 'RF-025', titulo: 'Usuarios, roles y módulos', modulo: 'usuarios', ruta: '/usuarios',
    actores: 'Administrador o desarrollador',
    desc: 'Alta de cuenta Auth + profiles (rol usuario/administrador/desarrollador). Asignación de módulos en usuario_modulos. Sin filas de módulos, no se restringe el menú (compatibilidad).',
    flujo: 'Nuevo usuario → rol → marcar módulos.',
    reglas: 'canManageUsuarios. Tras cambiar rol conviene reingresar (JWT).',
    datos: 'auth.users, profiles, usuario_modulos.',
    excepciones: 'Correo duplicado; confirmación de email en Auth.',
  },
  {
    id: 'RF-026', titulo: 'Auditoría', modulo: 'auditoria', ruta: '/auditoria',
    actores: 'Administrador o desarrollador (lectura plena); usuario ve lo propio según política',
    desc: 'Bitácora de insertar/actualizar/eliminar/login/logout/exportar. Filtros por fecha, usuario, tabla, app_id. Exportación.',
    flujo: 'Filtrar → inspeccionar JSON anterior/nuevo → exportar.',
    reglas: 'get_my_role in (administrador, desarrollador) para ver toda la bitácora.',
    datos: 'auditoria_sistema / audit_logs.',
    excepciones: 'Rol insuficiente.',
  },
  {
    id: 'RF-027', titulo: 'Configuración de controles documentales', modulo: 'Sistema', ruta: '/sistema/control-documental-*',
    actores: 'Administrador o desarrollador',
    desc: 'Ítems predefinidos (orden, descripción, activo) para checklists de proyectos, STR y rendiciones. Se instancian al crear formularios en las fichas.',
    flujo: 'ABM de ítems → aparecen en el control de cada registro.',
    reglas: 'Solo Sistema. Ítems inactivos no se ofrecen en altas nuevas según la UI.',
    datos: 'proyecto_control_items_predefinidos, str_control_items_predefinidos, rendiciones_cuentas_items_predeterminados; instancias en proyecto_control_formularios, str_documento_control, rendicion_control_formularios.',
    excepciones: 'Acceso denegado.',
  },
  {
    id: 'RF-028', titulo: 'Documentaciones y manuales PDF', modulo: 'documentaciones', ruta: '/documentaciones',
    actores: 'Todos los autenticados',
    desc: 'Guías paso a paso por módulo. Selección múltiple y PDF consolidado para inducción.',
    flujo: 'Marcar módulos → Generar documento.',
    reglas: 'Disponible para todos los roles autenticados.',
    datos: 'Catálogo estático documentacionModulos (no tabla).',
    excepciones: 'Ninguna crítica.',
  },
  {
    id: 'RF-029', titulo: 'Notificación de derivación por correo', modulo: 'expedientes', ruta: 'Edge Function notify-derivacion',
    actores: 'Sistema',
    desc: 'Al derivar, se notifica al responsable del área destino (Resend), si hay secretos configurados.',
    flujo: 'Insert seguimiento Derivado → función → correo.',
    reglas: 'Falla de correo no debe impedir persistir la derivación (degradación controlada).',
    datos: 'expediente_seguimiento, funcionarios, areas.',
    excepciones: 'Sin RESEND_API_KEY; destinatario sin correo.',
  },
  {
    id: 'RF-030', titulo: 'Integridad al eliminar', modulo: 'Transversal', ruta: 'CRUD',
    actores: 'Usuarios con permiso de baja',
    desc: 'Antes de borrar, se cuentan hijos conocidos (deleteGuard). Si hay vínculos, se informa y se bloquea. Errores FK 23503 se traducen a mensaje amigable.',
    flujo: 'Eliminar → conteo → confirmar o diálogo de bloqueo.',
    reglas: 'No se permite borrado en cascada destructivo desde la UI.',
    datos: 'TABLE_DELETE_DEPENDENCIES en src/lib/deleteGuard.ts.',
    excepciones: 'Tabla/columna ausente se ignora en el conteo.',
  },
]

const RNFS = [
  ['RNF-001', 'Seguridad — autenticación', 'Toda operación de datos requiere JWT válido de Supabase Auth. Anon key solo habilita RLS, no bypasa políticas.'],
  ['RNF-002', 'Seguridad — autorización', 'Tres roles de aplicación. RRHH y Sistema solo admin/dev. Módulos asignables por usuario. Reapertura de expedientes: administrador o desarrollador, leyendo profiles.role.'],
  ['RNF-003', 'Seguridad — RLS', 'Tablas con políticas basadas en auth.uid() y get_my_role(). Storage con políticas por bucket. Triggers SECURITY DEFINER para auditoría y reapertura.'],
  ['RNF-004', 'Integridad referencial', 'FK en PostgreSQL más guarda de UI. Cardinalidades documentadas en la matriz de relaciones. Borrado restringido con hijos.'],
  ['RNF-005', 'Auditoría y no repudio', 'Eventos de negocio y de app (login/logout/exportar) con actor, tabla, registro, datos anteriores/nuevos.'],
  ['RNF-006', 'Trazabilidad de expedientes', 'Cada movimiento de derivación/recepción queda en expediente_seguimiento con usuario, áreas, fechas y observación.'],
  ['RNF-007', 'Usabilidad', 'CRUD homogéneo (CrudModule), FKs buscables, paginación, vacíos con pista, confirmaciones de borrado, tema claro/oscuro, PDF institucionales.'],
  ['RNF-008', 'Rendimiento de listados', 'Paginación en UI. STR hasta 50.000 filas para totales. FKs críticos (expedientes en proyectos, STR en rendición) con fetchAll y orden con reintento sin order si falla.'],
  ['RNF-009', 'Disponibilidad', 'SPA estática en Hostinger (Vite, Node 20, output dist). Datos en Supabase. Caché de hosting se limpia tras cada publicación.'],
  ['RNF-010', 'Respaldos', 'Backup a cargo de Supabase (proyecto uepdb). El cliente debe conservar políticas de retención acordadas.'],
  ['RNF-011', 'Privacidad de archivos', 'Adjuntos por bucket; descarga autenticada / URL firmada. Avatares en bucket avatars.'],
  ['RNF-012', 'Internacionalización de montos y fechas', 'Guaraníes y fechas locales (formato DD/MM/AAAA). Marcaciones en hora de pared.'],
  ['RNF-013', 'Compatibilidad de navegador', 'Navegadores modernos (ES modules, Vite 7). Uso previsto en escritorio; layout adaptable.'],
  ['RNF-014', 'Mantenibilidad', 'Configuración de módulos en src/config/modules.tsx; roles en src/lib/roles.ts; migraciones versionadas en supabase/migrations.'],
  ['RNF-015', 'Secretos', 'URL y anon key de Supabase en variables de entorno. No versionar service_role. Resend y OpenAI opcionales por secretos.'],
]

const TABLAS = [
  ['profiles', 'Identidad', 'Perfil de aplicación (1:1 con auth.users): name, role, email, avatar_url, phone, address, is_blocked.'],
  ['usuario_modulos', 'Identidad', 'Permiso por usuario y clave de módulo (rol usuario/administrador/desarrollador a nivel módulo).'],
  ['auditoria_sistema', 'Sistema', 'Bitácora: accion, tabla, registro_id, actor_id, datos_anteriores/nuevos, meta, app_id.'],
  ['entidades', 'Catálogos', 'Remitentes de expedientes: razon_social, ruc, correo, telefono, direccion.'],
  ['proveedores', 'Catálogos', 'Proveedores/beneficiarios: documento (RUC), razon_social, contacto.'],
  ['fuentes_financiamiento', 'Catálogos', 'Fuentes FF: descripcion, detalle.'],
  ['objetos_de_gastos', 'Catálogos', 'OG: codigo, descripcion, og_principal_id (jerarquía).'],
  ['areas', 'RRHH', 'Dependencias: nombre, is_external, area_padre_id, descripcion (funciones), responsable_id.'],
  ['funcionarios', 'RRHH', 'Personal: nombre_completo, documento, correo, cargo, area_id, user_id, fecha_nacimiento, direccion.'],
  ['configuracion_marcacion', 'RRHH', 'Sede/geocerca: nombre_sede, latitud, longitud, radio_metros.'],
  ['marcaciones', 'RRHH', 'Entrada/salida: usuario_id, tipo, hora, latitud, longitud.'],
  ['actividades', 'Planificación', 'Actividad presupuestaria: codigo, descripcion, programa_id (según modelo).'],
  ['programas', 'Planificación', 'Programa: codigo, descripcion.'],
  ['componentes_programa', 'Planificación', 'Componente: codigo, descripcion, programa_id, actividad_id.'],
  ['subcomponentes_programa', 'Planificación', 'Subcomponente SNIP: componente_snip_id.'],
  ['items_programa', 'Planificación', 'Ítem SNIP: subcomponente_snip_id.'],
  ['subitems_programa', 'Planificación', 'Subítem SNIP: item_snip_id.'],
  ['presupuestos_programa', 'Planificación', 'Presupuesto anual: subitem_snip_id, montos/año.'],
  ['planes_financieros_administrativos', 'Planificación', 'Plan admin: anio, programa_id, actividad_id, objeto_de_gasto_id, fuente_financiamiento_id, monto_total, descripcion.'],
  ['cronograma_administrativo', 'Planificación', 'Mes/monto por plan_administrativo_id.'],
  ['modificaciones_administrativas', 'Planificación', 'Ajustes de plan admin: monto, tipo_modificacion.'],
  ['proyectos', 'Ejecución', 'Proyecto: descripcion, monto, componente_id, expediente_id, plan_administrativo_id, mes, anho, convenio.'],
  ['planes_financieros', 'Ejecución', 'Línea de plan del proyecto: proyecto_id, proveedor_id, objeto_de_gasto_id, fuente_financiamiento_id, monto.'],
  ['adendas', 'Ejecución', 'Ajuste de línea: plan_financiero_id, monto_ajuste, tipo_ajuste, estado.'],
  ['cronograma_financiero', 'Ejecución', 'Distribución mensual de la línea de plan.'],
  ['budget_commitments', 'Ejecución', 'CDP: cdp_numero, cdp_date, monto_comprometido, estado, proyecto_id, user_id, tipo_movimiento.'],
  ['actas', 'Ejecución', 'Acta: numero, fechas, montos, estado, formulario_control, archivo_firmado, proyecto_id.'],
  ['acta_items', 'Ejecución', 'Ítem de acta: acta_id, plan_financiero_id, adenda_id, montos.'],
  ['resolutions', 'Ejecución', 'Resolución: numero, fecha, tipo, archivo.'],
  ['resolution_items', 'Ejecución', 'Ítem de plan presupuestario: resolution_id, og_id, monto.'],
  ['resolution_proyectos', 'Ejecución', 'N:N resolución–proyecto.'],
  ['convenios', 'Ejecución', 'Convenio: proyecto_id, datos y adjunto.'],
  ['proyecto_adjuntos', 'Ejecución', 'Archivos del proyecto.'],
  ['proyecto_control_items_predefinidos', 'Sistema', 'Plantilla de control documental de proyectos.'],
  ['proyecto_control_formularios', 'Ejecución', 'Instancia de control documental por proyecto.'],
  ['proyecto_informes_tecnicos', 'Ejecución', 'Informe técnico de verificación (incl. infraestructura).'],
  ['proyecto_control_desembolsos', 'Ejecución', 'Formulario de control de desembolsos del proyecto.'],
  ['strs', 'Pagos', 'STR: numero, fecha, montos, proyecto_id, resolution_id, resolution_item_id, acta_id, fuente_id, og_id, nro_ot, fecha_desembolso, fecha_rendicion.'],
  ['str_archivos', 'Pagos', 'Adjuntos del STR.'],
  ['str_control_items_predefinidos', 'Sistema', 'Plantilla de control documental STR.'],
  ['str_documento_control', 'Pagos', 'Formulario de control documental por STR.'],
  ['devoluciones', 'Pagos', 'Devolución: str_id, objeto_gasto_id, monto.'],
  ['rendiciones_cuentas', 'Rendición', 'Rendición: str_id, expediente_id, estado, fechas, montos.'],
  ['rendicion_archivos', 'Rendición', 'Adjuntos de rendición.'],
  ['rendiciones_cuentas_items_predeterminados', 'Sistema', 'Plantilla de control de rendiciones.'],
  ['rendicion_control_formularios', 'Rendición', 'Formulario de control RC.'],
  ['expedientes', 'Mesa', 'numero_expediente, fecha_recepcion, asunto, entidad_id, estado, estado_finalizado, tipo, datos_rendicion, situacion_actual*, user_id.'],
  ['expediente_adjuntos', 'Mesa', 'Archivos del expediente.'],
  ['expediente_seguimiento', 'Mesa', 'Movimientos: areas origen/destino, estado, fechas, observación, recepción externa (quien_recibio, nro_expediente_asignado).'],
  ['expediente_desarrollos', 'Mesa', 'Ítems de desarrollo: fecha, descripcion, area_id, created_by.'],
  ['memos', 'Mesa', 'numero, fecha, de/para (ids y texto), cc, asunto, cuerpo, archivo_firmado, created_by.'],
]

const RELACIONES = [
  ['profiles', 'id', 'auth.users', 'id', '1:1', 'Cascade al borrar usuario Auth'],
  ['usuario_modulos', 'user_id', 'auth.users', 'id', 'N:1', 'Cascade'],
  ['areas', 'area_padre_id', 'areas', 'id', 'N:1', 'Jerarquía opcional'],
  ['areas', 'responsable_id', 'funcionarios', 'id', 'N:1', 'Set null / restrict según BD'],
  ['funcionarios', 'area_id', 'areas', 'id', 'N:1', 'Área de pertenencia'],
  ['funcionarios', 'user_id', 'profiles', 'id', 'N:1', 'Cuenta para recepcionar/derivar'],
  ['marcaciones', 'usuario_id', 'profiles', 'id', 'N:1', 'Dueño de la marca'],
  ['actividades', 'programa_id', 'programas', 'id', 'N:1', 'Si existe el vínculo en el modelo'],
  ['componentes_programa', 'programa_id', 'programas', 'id', 'N:1', 'Hijo del programa'],
  ['componentes_programa', 'actividad_id', 'actividades', 'id', 'N:1', 'Actividad presupuestaria'],
  ['subcomponentes_programa', 'componente_snip_id', 'componentes_programa', 'id', 'N:1', 'Árbol SNIP'],
  ['items_programa', 'subcomponente_snip_id', 'subcomponentes_programa', 'id', 'N:1', 'Árbol SNIP'],
  ['subitems_programa', 'item_snip_id', 'items_programa', 'id', 'N:1', 'Árbol SNIP'],
  ['presupuestos_programa', 'subitem_snip_id', 'subitems_programa', 'id', 'N:1', 'Presupuesto anual'],
  ['planes_financieros_administrativos', 'programa_id', 'programas', 'id', 'N:1', 'Imputación'],
  ['planes_financieros_administrativos', 'actividad_id', 'actividades', 'id', 'N:1', 'Imputación'],
  ['planes_financieros_administrativos', 'objeto_de_gasto_id', 'objetos_de_gastos', 'id', 'N:1', 'Imputación'],
  ['planes_financieros_administrativos', 'fuente_financiamiento_id', 'fuentes_financiamiento', 'id', 'N:1', 'Imputación'],
  ['cronograma_administrativo', 'plan_administrativo_id', 'planes_financieros_administrativos', 'id', 'N:1', 'Restrict (deleteGuard)'],
  ['modificaciones_administrativas', 'plan_administrativo_id', 'planes_financieros_administrativos', 'id', 'N:1', 'Restrict (deleteGuard)'],
  ['proyectos', 'componente_id', 'componentes_programa', 'id', 'N:1', 'Estructura programática'],
  ['proyectos', 'expediente_id', 'expedientes', 'id', 'N:1', 'Expediente de origen'],
  ['proyectos', 'plan_administrativo_id', 'planes_financieros_administrativos', 'id', 'N:1', 'Restrict si hay proyectos'],
  ['planes_financieros', 'proyecto_id', 'proyectos', 'id', 'N:1', 'Restrict (deleteGuard)'],
  ['planes_financieros', 'proveedor_id', 'proveedores', 'id', 'N:1', 'Obligatorio en UI'],
  ['planes_financieros', 'objeto_de_gasto_id', 'objetos_de_gastos', 'id', 'N:1', 'Obligatorio en UI'],
  ['planes_financieros', 'fuente_financiamiento_id', 'fuentes_financiamiento', 'id', 'N:1', 'Obligatorio en UI'],
  ['adendas', 'plan_financiero_id', 'planes_financieros', 'id', 'N:1', 'Restrict'],
  ['cronograma_financiero', 'plan_financiero_id', 'planes_financieros', 'id', 'N:1', 'Restrict'],
  ['budget_commitments', 'proyecto_id', 'proyectos', 'id', 'N:1', 'Restrict'],
  ['budget_commitments', 'user_id', 'profiles', 'id', 'N:1', 'Creador'],
  ['actas', 'proyecto_id', 'proyectos', 'id', 'N:1', 'Restrict'],
  ['acta_items', 'acta_id', 'actas', 'id', 'N:1', 'Cascade/restrict'],
  ['acta_items', 'plan_financiero_id', 'planes_financieros', 'id', 'N:1', 'Restrict'],
  ['acta_items', 'adenda_id', 'adendas', 'id', 'N:1', 'Restrict (ítems de adenda)'],
  ['resolution_items', 'resolution_id', 'resolutions', 'id', 'N:1', 'Restrict'],
  ['resolution_items', 'og_id', 'objetos_de_gastos', 'id', 'N:1', 'Imputación'],
  ['resolution_proyectos', 'resolution_id', 'resolutions', 'id', 'N:1', 'N:N'],
  ['resolution_proyectos', 'proyecto_id', 'proyectos', 'id', 'N:1', 'N:N'],
  ['convenios', 'proyecto_id', 'proyectos', 'id', 'N:1', 'Restrict'],
  ['proyecto_adjuntos', 'proyecto_id', 'proyectos', 'id', 'N:1', 'Restrict'],
  ['proyecto_control_formularios', 'proyecto_id', 'proyectos', 'id', 'N:1', 'Restrict'],
  ['proyecto_informes_tecnicos', 'proyecto_id', 'proyectos', 'id', 'N:1', 'Restrict'],
  ['proyecto_control_desembolsos', 'proyecto_id', 'proyectos', 'id', 'N:1', 'Por proyecto'],
  ['strs', 'proyecto_id', 'proyectos', 'id', 'N:1', 'Restrict'],
  ['strs', 'acta_id', 'actas', 'id', 'N:1', 'Restrict'],
  ['strs', 'resolution_id', 'resolutions', 'id', 'N:1', 'Plan de la resolución'],
  ['strs', 'resolution_item_id', 'resolution_items', 'id', 'N:1', 'Línea de plan'],
  ['strs', 'fuente_id', 'fuentes_financiamiento', 'id', 'N:1', 'Obligatorio en UI'],
  ['strs', 'og_id', 'objetos_de_gastos', 'id', 'N:1', 'Obligatorio en UI'],
  ['str_archivos', 'str_id', 'strs', 'id', 'N:1', 'Restrict'],
  ['str_documento_control', 'str_id', 'strs', 'id', 'N:1', 'Restrict'],
  ['devoluciones', 'str_id', 'strs', 'id', 'N:1', 'Restrict'],
  ['devoluciones', 'objeto_gasto_id', 'objetos_de_gastos', 'id', 'N:1', 'Imputación'],
  ['rendiciones_cuentas', 'str_id', 'strs', 'id', 'N:1', 'Restrict'],
  ['rendiciones_cuentas', 'expediente_id', 'expedientes', 'id', 'N:1', 'Opcional'],
  ['rendicion_archivos', 'rendicion_id', 'rendiciones_cuentas', 'id', 'N:1', 'Restrict'],
  ['rendicion_control_formularios', 'rendicion_id', 'rendiciones_cuentas', 'id', 'N:1', 'Restrict'],
  ['expedientes', 'entidad_id', 'entidades', 'id', 'N:1', 'Remitente obligatorio'],
  ['expedientes', 'user_id', 'profiles', 'id', 'N:1', 'Creador'],
  ['expediente_adjuntos', 'expediente_id', 'expedientes', 'id', 'N:1', 'Restrict'],
  ['expediente_seguimiento', 'expediente_id', 'expedientes', 'id', 'N:1', 'Restrict'],
  ['expediente_seguimiento', 'area_origen_id', 'areas', 'id', 'N:1', 'Derivación'],
  ['expediente_seguimiento', 'area_destino_id', 'areas', 'id', 'N:1', 'Derivación'],
  ['expediente_seguimiento', 'user_id', 'profiles', 'id', 'N:1', 'Actor del movimiento'],
  ['expediente_desarrollos', 'expediente_id', 'expedientes', 'id', 'N:1', 'Cascade'],
  ['expediente_desarrollos', 'area_id', 'areas', 'id', 'N:1', 'Set null'],
  ['expediente_desarrollos', 'created_by', 'auth.users', 'id', 'N:1', 'Set null'],
  ['objetos_de_gastos', 'og_principal_id', 'objetos_de_gastos', 'id', 'N:1', 'Jerarquía OG'],
  ['memos', 'de_funcionario_id', 'funcionarios', 'id', 'N:1', 'Restrict (deleteGuard)'],
  ['memos', 'para_funcionario_id', 'funcionarios', 'id', 'N:1', 'Restrict (deleteGuard)'],
  ['memos', 'created_by', 'profiles', 'id', 'N:1', 'Autor'],
  ['auditoria_sistema', 'actor_id', 'auth.users', 'id', 'N:1', 'Set null'],
]

const STORAGE = [
  ['convenios_adjuntos', 'Adjuntos de convenios'],
  ['resolutions-archivos', 'Archivos de resoluciones'],
  ['expedientes_adjuntos', 'Adjuntos de expedientes'],
  ['acta-archivos', 'Acta firmada / archivos de acta'],
  ['proyecto_adjuntos', 'Archivos del proyecto'],
  ['rendicion-archivos', 'Evidencias de rendición'],
  ['proyecto-control-formularios', 'Formularios de control de proyecto'],
  ['str-archivos', 'Adjuntos de STR'],
  ['proyecto-informes-tecnicos', 'Informes técnicos'],
  ['str-control-formularios', 'Control documental STR'],
  ['proyecto-control-desembolsos', 'Control de desembolsos'],
  ['memo-archivos', 'Memo firmado'],
  ['avatars', 'Fotos de perfil'],
]

const MATRIZ_ROL = [
  ['Panel, perfil, documentaciones', 'Sí', 'Sí', 'Sí'],
  ['Expedientes, memos, planificación, ejecución, pagos, rendición, catálogos, informes', 'Según usuario_modulos (si hay filas); si no hay filas, sí', 'Sí', 'Sí'],
  ['RRHH (áreas, funcionarios, marcaciones config)', 'No', 'Sí', 'Sí'],
  ['Sistema (usuarios, auditoría, controles documentales)', 'No (auditoría: solo propios si aplica)', 'Sí', 'Sí'],
  ['Reabrir expediente finalizado', 'No', 'Sí', 'Sí'],
  ['Eliminar movimiento de historial de expediente', 'No', 'Sí', 'Sí'],
  ['Carga masiva de memos', 'No', 'No', 'Sí'],
]

const TRAZA = [
  ['RF-001', 'Login/Perfil', 'profiles, usuario_modulos', '/login, /perfil'],
  ['RF-002', 'dashboard', 'varias (conteos)', '/'],
  ['RF-004 a RF-007', 'expedientes', 'expedientes y satélites', '/expedientes'],
  ['RF-008', 'memos', 'memos, funcionarios', '/memos'],
  ['RF-009', 'actividades, programas', 'árbol SNIP', '/planificacion/*'],
  ['RF-010', 'planes_admin', 'planes_financieros_administrativos…', '/planificacion/planes-administrativos'],
  ['RF-011, RF-012', 'proyectos', 'proyectos y satélites', '/proyectos, /proyectos/:id'],
  ['RF-013', 'cdp', 'budget_commitments', '/cdp'],
  ['RF-014', 'actas', 'actas, acta_items', '/actas'],
  ['RF-015', 'resoluciones', 'resolutions, items, proyectos', '/resoluciones'],
  ['RF-016', 'convenios', 'convenios', '/convenios'],
  ['RF-017', 'str', 'strs y satélites', '/pagos/str'],
  ['RF-018', 'devoluciones', 'devoluciones', '/pagos/devoluciones'],
  ['RF-019', 'rendiciones', 'rendiciones_cuentas…', '/rendiciones'],
  ['RF-020, RF-021', 'informes', 'lectura agregada', '/informes/*'],
  ['RF-022', 'catálogos', 'entidades, proveedores, FF, OG', '/catalogos/*'],
  ['RF-023, RF-024', 'RRHH', 'areas, funcionarios, marcaciones', '/catalogos/*, /marcaciones'],
  ['RF-025 a RF-027', 'sistema', 'profiles, auditoría, checklists', '/usuarios, /auditoria, /sistema/*'],
  ['RF-028', 'documentaciones', '(estático)', '/documentaciones'],
  ['RF-029', 'notificación', 'seguimiento + Resend', 'Edge Function'],
  ['RF-030', 'integridad', 'todas con hijos', 'CRUD'],
]

const ACEPTACION = [
  ['AC-01', 'Login con usuario válido ingresa al panel; inválido es rechazado.'],
  ['AC-02', 'Menú respeta rol y módulos asignados.'],
  ['AC-03', 'Alta de expediente General y de Rendición de Cuentas (con STR) persiste y se lista.'],
  ['AC-04', 'Derivar y recepcionar actualizan seguimiento y estado.'],
  ['AC-05', 'Expediente finalizado no se deriva; admin y desarrollador pueden reabrir (requiere SQL 044 en Supabase).'],
  ['AC-06', 'Proyecto 360° muestra pipeline y permite ABM embebido con proyecto fijado.'],
  ['AC-07', 'STR no permite monto que deje saldo de resolución negativo.'],
  ['AC-08', 'CDP anulado no suma en PDF/resúmenes de plan administrativo.'],
  ['AC-09', 'Borrar un proyecto con STR/actas/CDP se bloquea con mensaje de vínculos.'],
  ['AC-10', 'Rendición registra estado y adjuntos; control usa ítems predefinidos.'],
  ['AC-11', 'Informes admin generan archivo; asistente reconoce al menos expedientes/STR/proyectos.'],
  ['AC-12', 'Memo genera PDF y admite adjunto firmado.'],
  ['AC-13', 'Marcación dentro de geocerca se guarda; fuera se informa.'],
  ['AC-14', 'Auditoría visible para admin/dev.'],
  ['AC-15', 'Publicación en https://uep.kodespy.app sirve el build Vite (index.html + assets).'],
]

function rfBlocks() {
  const out = []
  for (const rf of RFS) {
    out.push(h3(`${rf.id}  ${rf.titulo}`))
    out.push(table(
      ['Atributo', 'Especificación'],
      [
        ['Módulo / ruta', `${rf.modulo}  ·  ${rf.ruta}`],
        ['Actores', rf.actores],
        ['Descripción', rf.desc],
        ['Flujo principal', rf.flujo],
        ['Reglas de negocio', rf.reglas],
        ['Datos persistidos', rf.datos],
        ['Excepciones', rf.excepciones],
      ],
    ))
    out.push(new Paragraph({ spacing: { after: 160 }, children: [] }))
  }
  return out
}

function headerFooter() {
  const header = new Header({
    children: [
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 6 } },
        spacing: { after: 80 },
        children: [
          r('GEREP  ·  Gestión de Recursos Públicos', { bold: true, size: 18, color: NAVY }),
          r('    |    ', { size: 18, color: MUTED }),
          r('ERS v1.0  ·  Entrega al cliente', { size: 18, color: MUTED }),
        ],
      }),
    ],
  })
  const footer = new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 8 } },
        alignment: AlignmentType.RIGHT,
        children: [
          r('Uso interno — entrega contractual    ·    Página ', { size: 16, color: MUTED }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 16, color: MUTED }),
          r(' de ', { size: 16, color: MUTED }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Calibri', size: 16, color: MUTED }),
        ],
      }),
    ],
  })
  return { header, footer }
}

function cover() {
  return [
    new Paragraph({ spacing: { before: 600, after: 80 }, alignment: AlignmentType.CENTER, children: [r('UNIDAD EJECUTORA DE PROYECTOS', { size: 22, color: MUTED, bold: true })] }),
    new Paragraph({ spacing: { after: 400 }, alignment: AlignmentType.CENTER, children: [r('Especificación de Requisitos de Software', { size: 28, color: NAVY })] }),
    new Paragraph({
      spacing: { before: 200, after: 80 },
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 16, color: NAVY, space: 12 }, bottom: { style: BorderStyle.SINGLE, size: 16, color: NAVY, space: 12 } },
      children: [r('GEREP', { size: 56, bold: true, color: NAVY })],
    }),
    new Paragraph({ spacing: { before: 200, after: 400 }, alignment: AlignmentType.CENTER, children: [r('Gestión de Recursos Públicos', { size: 32, color: NAVY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [r('Documento de entrega contractual', { size: 24, italics: true, color: MUTED })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [r('ISO/IEC/IEEE 29148  ·  IEEE 830 (adaptadas)', { size: 20, color: MUTED })] }),
    kvTable([
      ['Código', CONTROL.codigo],
      ['Versión del producto', CONTROL.version],
      ['Fecha', CONTROL.fecha],
      ['Cliente', CONTROL.cliente],
      ['Clasificación', CONTROL.clasificacion],
      ['Aplicación publicada', CONTROL.url],
    ]),
    new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER, children: [r('Este documento describe el sistema tal como está implementado. No sustituye el código fuente ni las políticas RLS de la base.', { size: 18, italics: true, color: MUTED })] }),
  ]
}

function sectionProps(hf) {
  return {
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1200, right: 1134, bottom: 1200, left: 1418 },
      },
    },
    headers: { default: hf.header },
    footers: { default: hf.footer },
  }
}

async function main() {
  const hf = headerFooter()
  const children = []

  // 0 cover is its own section without header clutter? Keep header for consistency after cover.
  children.push(...cover())
  children.push(pageBreak())

  children.push(h1('Control de cambios'))
  children.push(table(
    ['Versión', 'Fecha', 'Descripción', 'Autor'],
    [
      ['1.0', CONTROL.fecha, 'Versión inicial de entrega, generada desde el código de GEREP v1.0.0.', 'Equipo de implementación'],
    ],
  ))
  children.push(caption('Tabla 1. Historial de revisiones.'))

  children.push(h1('Índice'))
  children.push(noteUpdateToc())
  children.push(new TableOfContents('Índice', { hyperlink: true, headingStyleRange: '1-3' }))
  children.push(pageBreak())

  children.push(h1('1. Introducción'))
  children.push(h2('1.1 Propósito'))
  children.push(para('Este documento constituye la Especificación de Requisitos de Software (ERS) del sistema GEREP, destinada a la entrega formal al cliente. Define el alcance funcional, los actores, las reglas de negocio, el modelo de datos con sus relaciones, la seguridad y los criterios de aceptación verificables contra la aplicación en operación.'))
  children.push(h2('1.2 Alcance'))
  children.push(para('GEREP cubre el ciclo de gestión de recursos públicos de una Unidad Ejecutora: mesa de entrada (expedientes y memos), planificación programática y presupuestaria, ejecución de proyectos (plan, CDP, actas, resoluciones, convenios), pagos (STR y devoluciones), rendición de cuentas, informes, catálogos, RRHH (áreas, funcionarios, marcaciones) y administración del sistema (usuarios, auditoría, checklists documentales).'))
  children.push(para('Queda fuera de alcance: un ERP contable general, tesorería bancaria, SIAF nacional, y cualquier API propia distinta de PostgREST/Auth/Storage de Supabase. El motor de reapertura de expedientes en base de datos requiere aplicar la migración 044 en el proyecto Supabase del cliente.'))
  children.push(h2('1.3 Definiciones y acrónimos'))
  children.push(table(['Término', 'Definición'], GLOSARIO))
  children.push(caption('Tabla 2. Glosario.'))
  children.push(h2('1.4 Referencias'))
  children.push(bullet('ISO/IEC/IEEE 29148 — Ingeniería de sistemas y software: procesos de requisitos.'))
  children.push(bullet('IEEE 830 — Práctica recomendada para especificaciones de requisitos de software.'))
  children.push(bullet('Código fuente GEREP v1.0.0 (Vite/React/Supabase) y migraciones supabase/migrations.'))
  children.push(bullet('Documentación de módulo in-app (/documentaciones).'))
  children.push(h2('1.5 Visión general del documento'))
  children.push(para('Las secciones 2 y 3 describen el producto y los requisitos funcionales numerados (RF). La sección 4 fija requisitos no funcionales. La sección 5 es el modelo de datos y la matriz de relaciones. Las secciones 6 a 9 cubren seguridad, interfaces, trazabilidad y aceptación.'))

  children.push(h1('2. Descripción general del sistema'))
  children.push(h2('2.1 Perspectiva del producto'))
  children.push(para(`GEREP es una SPA alojada en Hostinger que consume un backend Supabase (PostgreSQL + Auth + Storage + RLS). No modifica la estructura de la base salvo migraciones versionadas acordadas. Identidad: ${CONTROL.producto}, versión ${CONTROL.version}.`))
  children.push(para(`Pila tecnológica: ${CONTROL.stack}.`))
  children.push(h2('2.2 Funciones del producto'))
  children.push(para('La aplicación se organiza en la cadena de ejecución:'))
  children.push(para('Actividad → Programa → Componente → Proyecto → Plan financiero (adendas) → CDP → Actas → Resoluciones → Convenios → STR → Devoluciones → Rendiciones de cuentas (CGR), en paralelo con Expedientes (mesa de entrada) y Memos.', { run: { italics: true } }))
  children.push(h2('2.3 Características de los usuarios'))
  children.push(table(['Actor', 'Descripción'], ACTORES))
  children.push(caption('Tabla 3. Actores.'))
  children.push(h2('2.4 Restricciones'))
  children.push(bullet('Autorización efectiva en RLS; la UI no es la única barrera.'))
  children.push(bullet('Integridad: no se elimina un padre con hijos (UI + FK).'))
  children.push(bullet('Archivos en buckets de Storage, no en el hosting estático.'))
  children.push(bullet('El rol JWT de Supabase es authenticated; el rol de negocio vive en profiles.role.'))
  children.push(h2('2.5 Supuestos y dependencias'))
  children.push(bullet('Proyecto Supabase uepdb operativo, con migraciones aplicadas (incluida 043 tipo de expediente y 044 reapertura admin/dev).'))
  children.push(bullet('Cuentas de hosting Hostinger y dominio uep.kodespy.app.'))
  children.push(bullet('Navegador actualizado y conectividad HTTPS.'))
  children.push(bullet('Resend opcional para correos de derivación; OpenAI opcional para el asistente.'))

  children.push(h2('2.6 Catálogo de módulos y rutas'))
  children.push(table(['Clave', 'Módulo', 'Sección', 'Ruta', 'Resumen'], MODULOS.map(m => [m[0], m[1], m[2], m[3], m[4]])))
  children.push(caption('Tabla 4. Módulos de GEREP (src/lib/appModulos.ts).'))

  children.push(h1('3. Requisitos funcionales'))
  children.push(para('Cada requisito se identifica como RF-xxx, es verificable y se traza a módulos y tablas. El comportamiento descrito corresponde a la implementación entregada.'))
  children.push(...rfBlocks())

  children.push(h1('4. Requisitos no funcionales'))
  children.push(table(['ID', 'Categoría', 'Requisito'], RNFS))
  children.push(caption('Tabla 5. Requisitos no funcionales.'))

  children.push(h1('5. Modelo de datos'))
  children.push(h2('5.1 Dominios'))
  children.push(para('El modelo se agrupa en: Identidad y sistema; Catálogos; RRHH; Planificación (árbol SNIP y planes administrativos); Ejecución (proyecto y documentos de respaldo); Pagos; Rendición; Mesa de entrada (expedientes y memos).'))
  children.push(h2('5.2 Cadena lógica (bloques)'))
  children.push(bullet('Planificación: programas y componentes alimentan proyectos y planes administrativos.'))
  children.push(bullet('Ejecución: el proyecto concentra plan financiero, CDP, actas, resoluciones y convenios.'))
  children.push(bullet('Pagos: la STR imputa un ítem de resolución (y opcionalmente un acta); las devoluciones corrigen el neto.'))
  children.push(bullet('Rendición: la rendición cierra el ciclo CGR sobre la STR y puede nacer de un expediente tipo Rendición de Cuentas.'))
  children.push(bullet('Mesa: el expediente deriva entre áreas; puede originar un proyecto (expediente_id).'))
  children.push(h2('5.3 Catálogo de tablas'))
  children.push(table(['Tabla', 'Dominio', 'Propósito / campos relevantes'], TABLAS))
  children.push(caption('Tabla 6. Catálogo de tablas de aplicación (esquema public, más auth.users).'))
  children.push(h2('5.4 Matriz de relaciones (integridad referencial)'))
  children.push(para('La siguiente matriz consolida claves foráneas usadas por la aplicación (formularios, select anidados y deleteGuard). La columna «Efecto» indica la política de negocio en UI y, cuando consta, el comportamiento de BD.'))
  children.push(table(
    ['Tabla origen', 'Columna FK', 'Tabla destino', 'Columna', 'Card.', 'Efecto al borrar / nota'],
    RELACIONES,
  ))
  children.push(caption(`Tabla 7. Relaciones (${RELACIONES.length} vínculos). Cardinalidad N:1 = muchos orígenes un destino.`))
  children.push(h2('5.5 Reglas de borrado (deleteGuard)'))
  children.push(para('La UI cuenta hijos antes de eliminar. Padres protegidos: proyectos, planes_financieros, adendas, planes_financieros_administrativos, actas, resolutions, resolution_items, strs, rendiciones_cuentas, expedientes, programas, actividades, componentes_programa, proveedores, objetos_de_gastos, fuentes_financiamiento, funcionarios.'))
  children.push(h2('5.6 Storage (buckets)'))
  children.push(table(['Bucket', 'Uso'], STORAGE))
  children.push(caption('Tabla 8. Buckets de Supabase Storage.'))
  children.push(h2('5.7 Funciones y disparadores relevantes'))
  children.push(bullet('get_my_role(): rol del usuario autenticado (profiles / JWT de negocio).'))
  children.push(bullet('fn_auditoria_row: registra altas, cambios y bajas.'))
  children.push(bullet('expedientes_rol_puede_reabrir / expedientes_guard_reabrir / reabrir_expediente: reapertura por administrador o desarrollador (migración 044).'))
  children.push(bullet('Numeradores de expediente, memo, acta, CDP, formulario de control.'))

  children.push(h1('6. Seguridad y perfiles'))
  children.push(h2('6.1 Matriz rol × capacidad'))
  children.push(table(['Capacidad', 'Usuario', 'Administrador', 'Desarrollador'], MATRIZ_ROL))
  children.push(caption('Tabla 9. Autorización de aplicación.'))
  children.push(h2('6.2 Notas de implementación'))
  children.push(para('El claim JWT role de Supabase vale authenticated. El rol de GEREP está en profiles.role (valores: usuario, administrador, desarrollador). Las políticas RLS deben consultar get_my_role() o profiles, nunca auth.jwt()→role para decidir si alguien es desarrollador. Tras cambiar un rol hay que volver a iniciar sesión.'))

  children.push(h1('7. Interfaces, reportes e integraciones'))
  children.push(h2('7.1 Interfaz de usuario'))
  children.push(para('Layout con menú por fases (General, 1 Planificación, 2 Ejecución, 3 Pagos, 4 Rendición, Informes, Catálogos, RRHH, Sistema). Motor CRUD genérico (CrudModule) con FKs buscables, totales, Excel y PDF de tablas. Fichas especiales: Proyecto 360°, Expediente, ProgramasExplorer, Informes, Asistente, Marcaciones, Usuarios, Auditoría.'))
  children.push(h2('7.2 Reportes y exportaciones'))
  children.push(bullet('PDF: actas, CDP, STR listado, memos, constancia de recepción de rendición, ficha técnica, informes admin, documentaciones, marcaciones, control de desembolso, informe técnico.'))
  children.push(bullet('Excel: listados CRUD, proyectos, auditoría, informes.'))
  children.push(bullet('Word: memos (lectura de DOCX en carga masiva) y salidas del asistente.'))
  children.push(h2('7.3 Integraciones'))
  children.push(table(
    ['Sistema', 'Uso'],
    [
      ['Supabase Auth / PostgREST / Storage', 'Identidad, datos y archivos'],
      ['Hostinger Node.js (Vite)', 'Hospedaje del front'],
      ['Resend', 'Correo de derivación (opcional)'],
      ['OpenAI', 'Refinar el asistente de informes (opcional)'],
      ['TURUC', 'Lookup de RUC en proveedores'],
    ],
  ))
  children.push(caption('Tabla 10. Integraciones.'))

  children.push(h1('8. Matriz de trazabilidad'))
  children.push(table(['Requisitos', 'Módulo', 'Tablas principales', 'Pantalla'], TRAZA))
  children.push(caption('Tabla 11. Trazabilidad RF → implementación.'))

  children.push(h1('9. Criterios de aceptación y acta de entrega'))
  children.push(h2('9.1 Criterios verificables'))
  children.push(table(['ID', 'Criterio'], ACEPTACION))
  children.push(caption('Tabla 12. Criterios de aceptación.'))
  children.push(h2('9.2 Entregables de software'))
  children.push(bullet('Aplicación GEREP v1.0.0 publicada (front) y proyecto Supabase con migraciones aplicadas.'))
  children.push(bullet('El presente ERS (este archivo).'))
  children.push(bullet('Manuales de usuario generables desde /documentaciones.'))
  children.push(h2('9.3 Acta de recepción (modelo)'))
  children.push(para('El cliente declara haber recibido GEREP en la versión indicada, con el conjunto de módulos de la Tabla 4, el modelo de datos de las Tablas 6 y 7, y los criterios de la Tabla 12 verificados o con no conformidades listadas en anexo. Firmas: por la UEP (nombre, cargo, fecha) y por el proveedor (nombre, cargo, fecha).'))
  children.push(h2('9.4 No conformidades conocidas / pendientes de entorno'))
  children.push(bullet('Si la base remota no tiene la migración 044, la reapertura de expedientes falla para admin y desarrollador. Acción: ejecutar supabase/fix_expedientes_reabrir.sql en el SQL Editor de Supabase.'))
  children.push(bullet('Si falta la migración 043, no se persiste el tipo Rendición de Cuentas ni datos_rendicion.'))

  children.push(h1('10. Anexos'))
  children.push(h2('10.1 Arquitectura lógica'))
  children.push(para('Navegador → SPA (Hostinger, dist/) → API REST PostgREST + Auth + Storage (Supabase) → PostgreSQL con RLS y triggers. Edge Function notify-derivacion para correo. Sin servidor de aplicación propio más allá del build estático y la función de notificación.'))
  children.push(h2('10.2 Identificación del paquete'))
  children.push(table(
    ['Ítem', 'Valor'],
    [
      ['Nombre npm', 'uep-proyectos'],
      ['Versión', CONTROL.version],
      ['Descripción', CONTROL.producto],
      ['Ruta local de desarrollo', 'http://localhost:5180'],
      ['Ruta de producción', CONTROL.url],
    ],
  ))
  children.push(h2('10.3 Fin del documento'))
  children.push(para('— Fin de la Especificación de Requisitos de Software GEREP v1.0 —', { align: AlignmentType.CENTER, run: { italics: true, color: MUTED } }))

  const doc = new Document({
    creator: 'GEREP / UEP',
    title: 'ERS GEREP v1.0 — Especificación de Requisitos de Software',
    description: 'Documento de entrega al cliente',
    styles: {
      default: {
        document: { styles: [] },
      },
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            {
              level: 0,
              format: 'bullet',
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 420, hanging: 220 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        ...sectionProps(hf),
        children,
      },
    ],
  })

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const buf = await Packer.toBuffer(doc)
  fs.writeFileSync(OUT_FILE, buf)
  console.log(`OK ${OUT_FILE} (${buf.length} bytes)`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
