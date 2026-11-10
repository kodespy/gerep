/** Guías paso a paso de funcionalidad por módulo (Documentaciones). */

export type DocPaso = {
  titulo: string
  detalle: string
}

export type DocModulo = {
  key: string
  label: string
  section: string
  ruta: string
  resumen: string
  pasos: DocPaso[]
}

export const DOCUMENTACION_MODULOS: DocModulo[] = [
  {
    key: 'dashboard',
    label: 'Panel de control',
    section: 'General',
    ruta: '/',
    resumen: 'Vista de inicio con acceso rápido al estado general del sistema.',
    pasos: [
      { titulo: 'Ingresar al Panel', detalle: 'Tras iniciar sesión, el Panel es la pantalla principal.' },
      { titulo: 'Revisar indicadores', detalle: 'Consulte resúmenes y accesos rápidos según su perfil.' },
      { titulo: 'Navegar a un módulo', detalle: 'Use el menú lateral o la búsqueda global para abrir un módulo.' },
    ],
  },
  {
    key: 'asistente_informes',
    label: 'Asistente de informes',
    section: 'Informes',
    ruta: '/informes/asistente',
    resumen: 'Genera informes en PDF, Excel o Word a partir de un pedido en lenguaje natural.',
    pasos: [
      { titulo: 'Abrir el asistente', detalle: 'Menú Informes → Asistente de informes.' },
      { titulo: 'Escribir el pedido', detalle: 'Ej.: “Expedientes en Excel”, “STR en PDF del mes actual”, “Cartera 360 en PDF”.' },
      { titulo: 'Generar', detalle: 'El sistema interpreta plantilla y formato, consulta la base y descarga el archivo.' },
      { titulo: 'OpenAI opcional', detalle: 'Si configura VITE_OPENAI_API_KEY, el asistente puede refinar la interpretación del pedido.' },
    ],
  },
  {
    key: 'actividades',
    label: 'Actividades',
    section: 'Planificación',
    ruta: '/planificacion/actividades',
    resumen: 'Catálogo de actividades que agrupan programas y la estructura programática.',
    pasos: [
      { titulo: 'Abrir Actividades', detalle: 'Menú Planificación → Actividades.' },
      { titulo: 'Buscar o filtrar', detalle: 'Use el buscador o filtros del listado para localizar una actividad.' },
      { titulo: 'Crear actividad', detalle: 'Pulse Nuevo, complete código y descripción, y guarde.' },
      { titulo: 'Editar o eliminar', detalle: 'Desde la fila correspondiente, edite los datos o elimine si no tiene dependencias.' },
    ],
  },
  {
    key: 'programas',
    label: 'Estructura programática',
    section: 'Planificación',
    ruta: '/planificacion/programas',
    resumen: 'Explorador de programas y componentes vinculados a actividades.',
    pasos: [
      { titulo: 'Abrir la estructura', detalle: 'Menú Planificación → Estructura programática.' },
      { titulo: 'Seleccionar actividad', detalle: 'Elija la actividad para ver sus programas.' },
      { titulo: 'Gestionar programas', detalle: 'Alta, edición o baja de programas según corresponda.' },
      { titulo: 'Gestionar componentes', detalle: 'Dentro de un programa, administre los componentes que luego se asocian a proyectos.' },
    ],
  },
  {
    key: 'planes_admin',
    label: 'Planes administrativos',
    section: 'Planificación',
    ruta: '/planificacion/planes-administrativos',
    resumen: 'Planes administrativos vinculados a la planificación operativa.',
    pasos: [
      { titulo: 'Abrir el módulo', detalle: 'Menú Planificación → Planes administrativos.' },
      { titulo: 'Consultar el listado', detalle: 'Revise planes existentes con filtros o búsqueda.' },
      { titulo: 'Registrar o actualizar', detalle: 'Cree un plan nuevo o edite uno existente y guarde los cambios.' },
      { titulo: 'Expandir detalle', detalle: 'Si el listado lo permite, abra el acordeón o detalle del plan para ver ítems asociados.' },
      { titulo: 'Exportar PDF consolidado', detalle: 'Use el botón PDF del listado para descargar el informe (resumen por programa/OG/fuente, gráficos Top 4 y detalle de CDPs). Respeta los filtros y la búsqueda activos. Los CDPs anulados se marcan y no entran en los totales de ejecución.' },
    ],
  },
  {
    key: 'proyectos',
    label: 'Proyectos',
    section: 'Ejecución',
    ruta: '/proyectos',
    resumen: 'Gestión 360° del proyecto: datos, control, informe técnico, archivos y documentos.',
    pasos: [
      { titulo: 'Listar proyectos', detalle: 'Menú Ejecución → Proyectos. Filtre por descripción, componente u otros criterios.' },
      { titulo: 'Crear proyecto', detalle: 'Pulse Nuevo, asocie componente/programa, descripción, montos y datos base; guarde.' },
      { titulo: 'Abrir vista 360°', detalle: 'Haga clic en el proyecto para ver pestañas (datos, control, informe, archivos, etc.).' },
      { titulo: 'Informe técnico', detalle: 'En la pestaña Informe, cree o edite el informe de verificación, complete estados y exporte PDF.' },
      { titulo: 'Infraestructura', detalle: 'Si aplica, active “Proyecto de infraestructura” para incluir verificación de llamado y adjudicado (Anexo XIX).' },
      { titulo: 'Adjuntos y control', detalle: 'Cargue archivos y complete el control documental según la configuración del sistema.' },
    ],
  },
  {
    key: 'cdp',
    label: 'CDP',
    section: 'Ejecución',
    ruta: '/cdp',
    resumen: 'Certificados / compromisos de disponibilidad presupuestaria vinculados a proyectos.',
    pasos: [
      { titulo: 'Abrir CDP', detalle: 'Menú Ejecución → CDP.' },
      { titulo: 'Registrar CDP', detalle: 'Cree un registro con número, proyecto, monto y descripción.' },
      { titulo: 'Consultar y editar', detalle: 'Busque por número o proyecto y actualice si corresponde.' },
      { titulo: 'Exportar PDF', detalle: 'Genere el PDF del CDP desde la acción de descarga disponible en el registro.' },
    ],
  },
  {
    key: 'actas',
    label: 'Actas',
    section: 'Ejecución',
    ruta: '/actas',
    resumen: 'Actas vinculadas a proyectos, con ítems y exportación a PDF.',
    pasos: [
      { titulo: 'Abrir Actas', detalle: 'Menú Ejecución → Actas.' },
      { titulo: 'Crear acta', detalle: 'Asocie proyecto, tipo (ordinaria o extraordinaria) y datos del acta. Las ordinarias siguen la serie 001-2026; las extraordinarias tienen numeración propia (001-E-2026, 002-E-2026…). Guarde.' },
      { titulo: 'Cargar ítems', detalle: 'En el detalle del acta, agregue líneas del plan financiero o una adenda (aprobación / desembolso del ajuste). Si elige una adenda, el ítem queda identificado como correspondiente a esa adenda.' },
      { titulo: 'Exportar PDF', detalle: 'Use el botón de descarga para generar el documento formal. Si el contenido no cabe en una hoja, el acta continúa en las páginas siguientes (con firmas al final). Los ítems del mismo OG se unifican, salvo las filas de adenda que se muestran aparte. Monto Aprobado de una fila de plan es el total del plan (+ adendas) de ese OG; si el ítem es de una adenda, Monto Aprobado es el ajuste de esa adenda.' },
    ],
  },
  {
    key: 'resoluciones',
    label: 'Resoluciones',
    section: 'Ejecución',
    ruta: '/resoluciones',
    resumen: 'Registro de resoluciones asociadas a la ejecución de proyectos.',
    pasos: [
      { titulo: 'Abrir Resoluciones', detalle: 'Menú Ejecución → Resoluciones.' },
      { titulo: 'Registrar', detalle: 'Complete número, fecha, proyecto y descripción; guarde.' },
      { titulo: 'Mantener el catálogo', detalle: 'Edite o elimine registros según la vigencia administrativa.' },
    ],
  },
  {
    key: 'convenios',
    label: 'Convenios',
    section: 'Ejecución',
    ruta: '/convenios',
    resumen: 'Convenios suscritos en el marco de la ejecución.',
    pasos: [
      { titulo: 'Abrir Convenios', detalle: 'Menú Ejecución → Convenios.' },
      { titulo: 'Alta de convenio', detalle: 'Registre número, fecha, proyecto y adjunte el convenio.' },
      { titulo: 'Adendas', detalle: 'El convenio puede no tener adenda, o tener una o varias. En cada una indique número, fecha y el PDF firmado.' },
    ],
  },
  {
    key: 'str',
    label: 'STR · Solicitudes',
    section: 'Pagos',
    ruta: '/pagos/str',
    resumen: 'Solicitudes de transferencia / pago con filtros, paginación y exportación PDF.',
    pasos: [
      { titulo: 'Abrir STR', detalle: 'Menú Pagos → STR · Solicitudes.' },
      { titulo: 'Filtrar', detalle: 'Use Actividad → Programa → Componente y, si aplica, rango de fechas.' },
      { titulo: 'Revisar listado', detalle: 'Navegue páginas del listado y abra el detalle de cada STR.' },
      { titulo: 'Exportar PDF', detalle: 'Genere el PDF consolidado con detalle, totales y resúmenes (OG, nivel, FF/OF, etc.).' },
    ],
  },
  {
    key: 'devoluciones',
    label: 'Devoluciones',
    section: 'Pagos',
    ruta: '/pagos/devoluciones',
    resumen: 'Registro de devoluciones de fondos vinculadas a la cadena de pagos.',
    pasos: [
      { titulo: 'Abrir Devoluciones', detalle: 'Menú Pagos → Devoluciones.' },
      { titulo: 'Registrar devolución', detalle: 'Indique montos, referencias y proyecto/STR relacionado.' },
      { titulo: 'Consultar historial', detalle: 'Filtre y revise devoluciones cargadas para control posterior.' },
    ],
  },
  {
    key: 'rendiciones',
    label: 'Rendiciones de cuentas',
    section: 'Rendición',
    ruta: '/rendiciones',
    resumen: 'Gestión de rendiciones de cuentas, formulario de control y adjuntos.',
    pasos: [
      { titulo: 'Abrir Rendiciones', detalle: 'Menú Rendición → Rendiciones de cuentas.' },
      { titulo: 'Hoja Rendiciones', detalle: 'Registre y gestione las rendiciones vinculadas a STR/expediente.' },
      { titulo: 'Hoja Formularios de Control', detalle: 'Consulte todos los formularios RC, genere PDF o ábralos para editar.' },
      { titulo: 'Adjuntos', detalle: 'Adjunte evidencias de respaldo desde cada fila de rendición.' },
    ],
  },
  {
    key: 'expedientes',
    label: 'Expedientes',
    section: 'Mesa de entrada',
    ruta: '/expedientes',
    resumen: 'Mesa de entrada: alta, derivación y seguimiento de expedientes.',
    pasos: [
      { titulo: 'Abrir Expedientes', detalle: 'Desde el ícono de Mesa de entrada en el encabezado o la ruta /expedientes.' },
      { titulo: 'Registrar expediente', detalle: 'Cargue número, asunto, entidad remitente y demás datos de ingreso.' },
      { titulo: 'Derivar', detalle: 'Envíe el expediente a un área destino con observación. El aviso llega al responsable de esa dependencia.' },
      { titulo: 'Recepcionar', detalle: 'Solo el responsable del área destino (a quien se derivó) puede registrar la recepción. Los demás usuarios del área ven el botón desactivado.' },
      { titulo: 'Seguimiento', detalle: 'En el detalle, revise movimientos y recepción.' },
      {
        titulo: 'Desarrollo del expediente',
        detalle: 'Solo el responsable del área donde está el expediente (ya recepcionado) puede agregar ítems con fecha y descripción, por ejemplo: 20/08/2026 Retraso debido a falta de documentación, remitido por correo observaciones. El historial se conserva al derivar.',
      },
      { titulo: 'Exportar seguimiento', detalle: 'Si está disponible, genere el PDF del historial de movimientos.' },
    ],
  },
  {
    key: 'memos',
    label: 'Memos',
    section: 'Mesa de entrada',
    ruta: '/memos',
    resumen: 'Elaborar, modificar e imprimir memorándums UEP, con copia a varias personas y adjunto del documento firmado.',
    pasos: [
      { titulo: 'Abrir Memos', detalle: 'Menú General → Memos.' },
      { titulo: 'Crear', detalle: 'El N° se propone solo (001/2026…) y se puede editar. De, Para y CC se escriben a mano (nombre y cargo debajo); también puede elegir del catálogo. Complete Asunto y el cuerpo (tablas, tamaño, negrita, justificado, listas e imágenes; el PDF respeta el formato).' },
      { titulo: 'Carga masiva', detalle: 'Solo rol Desarrollador: use Carga masiva para elegir una carpeta (o varios .docx). Lee MEMORÁNDUM UEP N°, De, Para, Asunto, Fecha y cuerpo. Los N° que ya existen se omiten.' },
      { titulo: 'Duplicar', detalle: 'En la fila, use el ícono de copiar para clonar el memo. Se abre un alta con De, Para, CC, Asunto y cuerpo; el N° es el siguiente de la serie y no se copia el firmado.' },
      { titulo: 'Imprimir', detalle: 'En la fila, descargue el PDF institucional para firma.' },
      { titulo: 'Adjuntar firmado', detalle: 'Suba el PDF/imagen firmado. Mientras esté adjunto, no se regenera el PDF de trabajo.' },
    ],
  },
  {
    key: 'entidades',
    label: 'Entidades',
    section: 'Catálogos',
    ruta: '/catalogos/entidades',
    resumen: 'Catálogo de entidades (proponentes / remitentes).',
    pasos: [
      { titulo: 'Abrir Entidades', detalle: 'Menú Catálogos → Entidades.' },
      { titulo: 'Alta', detalle: 'Registre razón social y datos identificatorios.' },
      { titulo: 'Mantenimiento', detalle: 'Actualice o desactive registros usados por expedientes y proyectos.' },
    ],
  },
  {
    key: 'proveedores',
    label: 'Proveedores',
    section: 'Catálogos',
    ruta: '/catalogos/proveedores',
    resumen: 'Catálogo de proveedores / oferentes.',
    pasos: [
      { titulo: 'Abrir Proveedores', detalle: 'Menú Catálogos → Proveedores.' },
      { titulo: 'Registrar', detalle: 'Cargue razón social, documento y datos de contacto.' },
      { titulo: 'Usar en procesos', detalle: 'Los proveedores quedan disponibles para vincular en ejecución y pagos.' },
    ],
  },
  {
    key: 'fuentes',
    label: 'Fuentes de financiamiento',
    section: 'Catálogos',
    ruta: '/catalogos/fuentes',
    resumen: 'Fuentes y orígenes de financiamiento.',
    pasos: [
      { titulo: 'Abrir Fuentes', detalle: 'Menú Catálogos → Fuentes de financiamiento.' },
      { titulo: 'Mantener catálogo', detalle: 'Alta y edición de códigos/descripciones usados en imputaciones.' },
    ],
  },
  {
    key: 'objetos_gasto',
    label: 'Objetos de gasto',
    section: 'Catálogos',
    ruta: '/catalogos/objetos-gasto',
    resumen: 'Catálogo presupuestario de objetos de gasto.',
    pasos: [
      { titulo: 'Abrir Objetos de gasto', detalle: 'Menú Catálogos → Objetos de gasto.' },
      { titulo: 'Registrar OG', detalle: 'Ingrese código y descripción.' },
      { titulo: 'Uso en informes/STR', detalle: 'Los OG se seleccionan en informes técnicos, actas, STR y otros módulos.' },
    ],
  },
  {
    key: 'areas',
    label: 'Áreas',
    section: 'RRHH',
    ruta: '/catalogos/areas',
    resumen: 'Áreas organizacionales (internas/externas) para derivaciones.',
    pasos: [
      { titulo: 'Abrir Áreas', detalle: 'Menú RRHH → Áreas (si su rol tiene acceso).' },
      { titulo: 'Definir áreas', detalle: 'Alta de áreas con nombre y marca de externa si corresponde.' },
      { titulo: 'Usar en expedientes', detalle: 'Las áreas aparecen como origen/destino en derivaciones.' },
    ],
  },
  {
    key: 'funcionarios',
    label: 'Funcionarios',
    section: 'RRHH',
    ruta: '/catalogos/funcionarios',
    resumen: 'Nómina de funcionarios para RRHH y reportes. Cada funcionario puede asociarse a un Usuario del sistema (login) para Recepcionar/Derivar.',
    pasos: [
      { titulo: 'Abrir Funcionarios', detalle: 'Menú RRHH → Funcionarios.' },
      { titulo: 'Registrar funcionario', detalle: 'Complete identificación y datos laborales básicos.' },
      { titulo: 'Mantener vigencia', detalle: 'Actualice datos ante altas, bajas o cambios de área.' },
    ],
  },
  {
    key: 'marcaciones',
    label: 'Reporte de marcaciones',
    section: 'RRHH',
    ruta: '/marcaciones',
    resumen: 'Consulta y exportación del reporte de marcaciones.',
    pasos: [
      { titulo: 'Abrir Marcaciones', detalle: 'Menú RRHH → Reporte de marcaciones.' },
      { titulo: 'Definir rango', detalle: 'Seleccione fechas y filtros de personal.' },
      { titulo: 'Consultar', detalle: 'Revise el listado resultante.' },
      { titulo: 'Exportar', detalle: 'Descargue PDF o Excel según las acciones disponibles.' },
    ],
  },
  {
    key: 'usuarios',
    label: 'Usuarios',
    section: 'Sistema',
    ruta: '/usuarios',
    resumen: 'Alta de usuarios, roles y permisos por módulo.',
    pasos: [
      { titulo: 'Abrir Usuarios', detalle: 'Menú Sistema → Usuarios (roles administrador/desarrollador).' },
      { titulo: 'Crear usuario', detalle: 'Pulse Nuevo, complete nombre, email, contraseña y rol.' },
      { titulo: 'Asignar módulos', detalle: 'Expanda la fila del usuario y marque los módulos habilitados.' },
      { titulo: 'Actualizar perfil', detalle: 'Edite datos o rol según cambios organizativos.' },
    ],
  },
  {
    key: 'auditoria',
    label: 'Auditoría',
    section: 'Sistema',
    ruta: '/auditoria',
    resumen: 'Trazabilidad de acciones (insert, update, delete, login, etc.).',
    pasos: [
      { titulo: 'Abrir Auditoría', detalle: 'Menú Sistema → Auditoría.' },
      { titulo: 'Filtrar', detalle: 'Defina fechas, usuario, acción o tabla.' },
      { titulo: 'Inspeccionar detalle', detalle: 'Expanda filas para ver el contenido del evento.' },
      { titulo: 'Exportar', detalle: 'Descargue a Excel cuando necesite respaldo externo.' },
    ],
  },
  {
    key: 'control_documental_proyectos',
    label: 'Control documental de proyectos',
    section: 'Sistema',
    ruta: '/sistema/control-documental-proyectos',
    resumen: 'Configura los ítems de checklist documental que se exigen en proyectos.',
    pasos: [
      { titulo: 'Abrir configuración', detalle: 'Menú Sistema → Control documental de proyectos.' },
      { titulo: 'Definir ítems', detalle: 'Alta de requisitos documentales con orden y descripción.' },
      { titulo: 'Impacto en proyectos', detalle: 'Los ítems aparecen en el control documental de la ficha del proyecto.' },
    ],
  },
  {
    key: 'control_documental_str',
    label: 'Control documental de STR',
    section: 'Sistema',
    ruta: '/sistema/control-documental-str',
    resumen: 'Configura los ítems de checklist documental que se exigen en cada STR.',
    pasos: [
      { titulo: 'Abrir configuración', detalle: 'Menú Sistema → Control documental de STR.' },
      { titulo: 'Definir ítems', detalle: 'Alta de requisitos documentales con orden y descripción (incluye los 15 ítems iniciales).' },
      { titulo: 'Impacto en STR', detalle: 'Los ítems se cargan al crear un formulario de control desde el listado o ficha de STR.' },
    ],
  },
  {
    key: 'control_rendiciones_cuentas',
    label: 'Control de rendiciones de cuentas',
    section: 'Sistema',
    ruta: '/sistema/control-rendiciones-cuentas',
    resumen: 'Configura requisitos de control para rendiciones de cuentas.',
    pasos: [
      { titulo: 'Abrir configuración', detalle: 'Menú Sistema → Control de rendiciones de cuentas.' },
      { titulo: 'Mantener checklist', detalle: 'Defina documentos o controles exigidos en rendiciones.' },
      { titulo: 'Verificar en módulo', detalle: 'En Rendiciones, el equipo completa según esta configuración.' },
    ],
  },
  {
    key: 'perfil',
    label: 'Mi perfil',
    section: 'General',
    ruta: '/perfil',
    resumen: 'Datos del usuario autenticado y ajustes personales.',
    pasos: [
      { titulo: 'Abrir perfil', detalle: 'Menú de usuario → Perfil y ajustes, o ruta /perfil.' },
      { titulo: 'Revisar datos', detalle: 'Consulte nombre, email y rol asignado.' },
      { titulo: 'Actualizar información', detalle: 'Modifique los campos editables y guarde.' },
    ],
  },
  {
    key: 'documentaciones',
    label: 'Documentaciones',
    section: 'General',
    ruta: '/documentaciones',
    resumen: 'Manuales paso a paso de cada módulo y generación de PDF.',
    pasos: [
      { titulo: 'Abrir Documentaciones', detalle: 'Menú de usuario (avatar) → Documentaciones, debajo de Perfil y Ajustes.' },
      { titulo: 'Seleccionar módulos', detalle: 'Marque uno, varios o todos los módulos a incluir.' },
      { titulo: 'Generar PDF', detalle: 'Pulse Generar documento para descargar la guía consolidada.' },
      { titulo: 'Usar como capacitación', detalle: 'Distribuya el PDF a nuevos usuarios o como material de inducción.' },
    ],
  },
]

export function docModulosPorSeccion(): { section: string; items: DocModulo[] }[] {
  const map = new Map<string, DocModulo[]>()
  for (const m of DOCUMENTACION_MODULOS) {
    const list = map.get(m.section)
    if (list) list.push(m)
    else map.set(m.section, [m])
  }
  return [...map.entries()].map(([section, items]) => ({ section, items }))
}

export function docModulosByKeys(keys: string[]): DocModulo[] {
  const set = new Set(keys)
  return DOCUMENTACION_MODULOS.filter(m => set.has(m.key))
}
