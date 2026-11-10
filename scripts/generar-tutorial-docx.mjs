/**
 * Genera docs/entrega/Tutorial-basico-GEREP.docx
 * Tutorial de uso con capturas de pantalla.
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
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CAP = path.join(ROOT, 'docs', 'entrega', 'capturas')
const OUT = path.join(ROOT, 'docs', 'entrega', 'Tutorial-basico-GEREP.docx')

const NAVY = '1B3A4B'
const MUTED = '5C6B7A'
const LINE = 'C5CDD6'
const HEAD_BG = '1B3A4B'
const ROW_ALT = 'F3F5F7'
const WHITE = 'FFFFFF'
const PAGE_W = 9360

function r(text, o = {}) {
  return new TextRun({
    text: text ?? '',
    font: 'Calibri',
    size: o.size ?? 22,
    bold: !!o.bold,
    italics: !!o.italics,
    color: o.color ?? '222222',
  })
}

function para(text, o = {}) {
  return new Paragraph({
    spacing: { after: o.after ?? 160, before: o.before ?? 0, line: 276 },
    alignment: o.align ?? AlignmentType.JUSTIFIED,
    children: Array.isArray(text) ? text : [r(text, o.run ?? {})],
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
    spacing: { before: 260, after: 120 },
    children: [r(text, { bold: true, size: 26, color: NAVY })],
  })
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 80 },
    children: [r(text, { size: 21 })],
  })
}

function step(n, title, detail) {
  return [
    new Paragraph({
      spacing: { before: 140, after: 60 },
      children: [r(`Paso ${n}. ${title}`, { bold: true, size: 22, color: NAVY })],
    }),
    para(detail),
  ]
}

function cell(text, o = {}) {
  const cols = o.cols || 3
  const w = o.w ?? Math.round(PAGE_W / cols)
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: o.header ? { type: ShadingType.CLEAR, fill: HEAD_BG } : o.alt ? { type: ShadingType.CLEAR, fill: ROW_ALT } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({
        children: [r(String(text ?? ''), { size: 18, bold: !!o.header, color: o.header ? WHITE : '222222' })],
      }),
    ],
  })
}

function table(headers, rows) {
  const cols = headers.length
  const widths = cols === 2 ? [2800, PAGE_W - 2800] : cols === 3 ? [2200, 3200, PAGE_W - 5400] : headers.map(() => Math.round(PAGE_W / cols))
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { header: true, w: widths[i], cols })) }),
      ...rows.map((row, ri) => new TableRow({
        children: row.map((c, i) => cell(c, { alt: ri % 2 === 1, w: widths[i], cols })),
      })),
    ],
  })
}

function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

function figure(file, caption, maxW = 520) {
  const abs = path.join(CAP, file)
  const buf = fs.readFileSync(abs)
  const dim = pngSize(buf)
  const width = maxW
  const height = Math.max(120, Math.round((maxW * dim.height) / dim.width))
  return [
    new Paragraph({
      spacing: { before: 120, after: 60 },
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          type: 'png',
          data: buf,
          transformation: { width, height },
        }),
      ],
    }),
    para(caption, { after: 220, align: AlignmentType.CENTER, run: { size: 18, italics: true, color: MUTED } }),
  ]
}

function pageBreak() {
  return new Paragraph({ children: [r('')], pageBreakBefore: true })
}

async function main() {
  const header = new Header({
    children: [
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: NAVY, space: 6 } },
        children: [
          r('GEREP  ·  Tutorial básico de uso', { bold: true, size: 18, color: NAVY }),
          r('    ·    v1.0.0', { size: 18, color: MUTED }),
        ],
      }),
    ],
  })
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 8 } },
        children: [
          r('Uso interno — capacitación    ·    Página ', { size: 16, color: MUTED }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 16, color: MUTED }),
        ],
      }),
    ],
  })

  const iconBuf = fs.readFileSync(path.join(CAP, 'icono.png'))
  const iconDim = pngSize(iconBuf)
  const iconW = 92
  const iconH = Math.round((iconW * iconDim.height) / iconDim.width)

  const children = [
    new Paragraph({
      spacing: { before: 200, after: 80 },
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({ type: 'png', data: iconBuf, transformation: { width: iconW, height: iconH } }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [r('UNIDAD EJECUTORA DE PROYECTOS', { size: 20, color: MUTED, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [r('GEREP', { size: 48, bold: true, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [r('Gestión de Recursos Públicos', { size: 28, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
      children: [r('Tutorial básico de uso  ·  16 de septiembre de 2026', { size: 22, italics: true, color: MUTED })],
    }),
    para('Este instructivo está pensado para un usuario que entra por primera vez. Explica cómo iniciar sesión, moverse por el menú y completar las tareas más frecuentes: expedientes, proyectos y STR (pagos).'),
    para('Dirección de la aplicación: https://uep.kodespy.app', { run: { bold: true } }),

    h1('1. Iniciar sesión'),
    para('Abra el sistema en el navegador. Verá la pantalla de ingreso con el logotipo GEREP, el correo y la contraseña.'),
    ...figure('01-login.png', 'Figura 1. Pantalla de inicio de sesión (GEREP en producción).'),
    ...step(1, 'Escriba su correo', 'Use la cuenta que le asignó el administrador del sistema (no es el correo personal, salvo que así se haya creado).'),
    ...step(2, 'Escriba su contraseña', 'Respete mayúsculas y minúsculas. Si olvidó la clave, solicite el restablecimiento al administrador.'),
    ...step(3, 'Pulse Ingresar', 'Si los datos son correctos, entra al Panel de control. Si no, verá «Credenciales inválidas».'),
    para('¿Sin acceso? El pie de la pantalla indica que debe solicitar su cuenta al administrador. No hay autoregistro.'),

    h1('2. Cómo está organizada la pantalla'),
    para('Después de entrar, la pantalla se divide en tres zonas:'),
    bullet('Izquierda: menú por fases (General, 1 Planificación, 2 Ejecución, 3 Pagos, 4 Rendición, Informes, Catálogos).'),
    bullet('Arriba: nombre GEREP, buscador, acceso rápido a Expedientes, avisos y su usuario.'),
    bullet('Centro: el módulo en el que está trabajando.'),
    ...figure('02-panel.png', 'Figura 2. Panel de control: menú a la izquierda e indicadores al centro.'),
    para('La opción activa del menú se marca en oscuro. Use el buscador superior para localizar un registro o un módulo sin recorrer toda la lista.'),
    h2('2.1 Qué hace cada bloque del menú'),
    table(
      ['Menú', 'Para qué sirve'],
      [
        ['General', 'Panel, Expedientes (mesa de entrada) y Memos.'],
        ['1 · Planificación', 'Actividades, estructura programática y planes administrativos.'],
        ['2 · Ejecución', 'Proyectos, CDP, Actas, Resoluciones y Convenios.'],
        ['3 · Pagos', 'STR (solicitudes de transferencia) y Devoluciones.'],
        ['4 · Rendición', 'Rendiciones de cuentas ante CGR.'],
        ['Informes', 'Asistente y reportes administrativos/financieros.'],
        ['Catálogos', 'Entidades, proveedores, fuentes y objetos de gasto.'],
      ],
    ),
    para('Los menús RRHH y Sistema solo aparecen si su rol es administrador o desarrollador.', { run: { italics: true, color: MUTED } }),

    h1('3. Expedientes (mesa de entrada)'),
    para('Un expediente es un trámite que ingresa a la UEP. Se registra, se deriva a un área, se recepciona y, al terminar, se marca como finalizado.'),
    ...figure('03-expedientes.png', 'Figura 3. Listado de expedientes: número, asunto, entidad y estado.'),
    ...step(1, 'Abrir Expedientes', 'Menú General → Expedientes, o el ícono de buzón en el encabezado.'),
    ...step(2, 'Crear', 'Pulse Nuevo / Expediente. El número se propone solo. Complete fecha de recepción, tipo (General o Rendición de Cuentas), asunto en mayúsculas y entidad remitente. El estado inicial es «Inicio de trámite».'),
    ...step(3, 'Derivar', 'Abra la ficha y derive al área destino con una observación. El responsable de esa dependencia recibe el aviso.'),
    ...step(4, 'Recepcionar', 'Solo el responsable del área a la que se derivó registra la recepción. Luego puede agregar «desarrollo» (fecha + nota) y volver a derivar.'),
    ...step(5, 'Finalizar', 'Cuando el trámite concluyó, marque el expediente como finalizado. Un expediente finalizado no se deriva.'),
    para('Reabrir un expediente finalizado solo lo pueden hacer un administrador o un desarrollador.'),

    h1('4. Proyectos'),
    para('El proyecto es el centro de la ejecución. Desde su ficha (vista 360°) se operan plan financiero, CDP, actas, resoluciones, convenios, STR y rendiciones, con el proyecto ya fijado.'),
    ...figure('04-proyectos.png', 'Figura 4. Módulo Proyectos: pipeline de montos y listado.'),
    ...step(1, 'Abrir Proyectos', 'Menú 2 · Ejecución → Proyectos.'),
    ...step(2, 'Crear', 'Descripción, monto, componente (programa) y, si corresponde, el expediente de origen.'),
    ...step(3, 'Abrir la ficha 360°', 'Haga clic en el proyecto. Use las pestañas o el pipeline para ir a CDP, actas, STR, etc.'),
    ...step(4, 'No eliminar con hijos', 'Si el proyecto tiene plan, CDP, actas o STR, el sistema bloquea el borrado y muestra los vínculos.'),

    h1('5. STR · Solicitudes de transferencia'),
    para('La STR es el pago / desembolso. Debe imputarse a una línea del plan presupuestario de una resolución (no a una resolución de «solo aprobación»). El monto no puede superar el saldo disponible de esa línea.'),
    ...figure('05-str.png', 'Figura 5. Listado de STR: número, proyecto y fecha.'),
    ...step(1, 'Abrir STR', 'Menú 3 · Pagos → STR · Solicitudes (también desde la ficha del proyecto).'),
    ...step(2, 'Registrar', 'Elija proyecto, resolución, ítem de plan, fuente, objeto de gasto, monto, OT y fechas de desembolso / rendición.'),
    ...step(3, 'Control y adjuntos', 'Complete el formulario de control documental y adjunte respaldos.'),
    ...step(4, 'Devoluciones y rendición', 'Si hay que devolver fondos, use Devoluciones. La rendición de cuentas se carga en el menú 4 · Rendición, vinculada a la STR.'),

    h1('6. Tareas frecuentes (resumen)'),
    table(
      ['Quiere…', 'Vaya a…', 'Recuerde'],
      [
        ['Ingresar un trámite', 'Expedientes', 'Derivar y recepcionar por área'],
        ['Redactar un memorándum', 'Memos', 'Imprimir PDF y luego adjuntar el firmado'],
        ['Ver el presupuesto del proyecto', 'Proyectos → ficha 360°', 'Plan + adendas = vigente'],
        ['Registrar un compromiso', 'CDP', 'Los anulados no suman'],
        ['Aprobar un desembolso', 'Actas', 'Ítems del plan o de una adenda'],
        ['Pagar', 'STR', 'Saldo de la resolución'],
        ['Rendir a CGR', 'Rendiciones', 'Plazo vs fecha de rendición de la STR'],
        ['Sacar un informe', 'Asistente de informes', 'Ej.: «STR en PDF del mes actual»'],
      ],
    ),

    h1('7. Perfil y salida'),
    bullet('Abra el menú de su avatar (arriba a la derecha) → Perfil y ajustes para actualizar nombre, teléfono o foto.'),
    bullet('Documentaciones (mismo menú) genera un PDF paso a paso de cada módulo, útil para inducción.'),
    bullet('Cerrar sesión al terminar, sobre todo en equipos compartidos.'),

    h1('8. Si algo no funciona'),
    table(
      ['Situación', 'Qué hacer'],
      [
        ['No entra', 'Verificar correo/clave; pedir alta al administrador.'],
        ['No ve un menú', 'Su usuario no tiene ese módulo asignado.'],
        ['No puede recepcionar un expediente', 'Solo el responsable del área destino (o admin/dev en recepción externa).'],
        ['No puede reactivar un expediente', 'Debe ser administrador o desarrollador.'],
        ['No puede borrar un registro', 'Tiene datos vinculados; elimine o reasigne los hijos.'],
        ['No aparecen STR en un selector', 'Use la búsqueda; el listado trae el universo de STR.'],
      ],
    ),

    h1('9. Cierre'),
    para('Con estos pasos un usuario puede entrar, registrar un expediente, abrir un proyecto y cargar una STR. Para el detalle de cada campo y de los informes, use el módulo Documentaciones o la Especificación de Requisitos (ERS-GEREP-v1.0.docx) entregada junto con este tutorial.'),
    para('— Fin del tutorial básico GEREP —', { align: AlignmentType.CENTER, run: { italics: true, color: MUTED } }),
  ]

  const doc = new Document({
    creator: 'GEREP / UEP',
    title: 'Tutorial básico GEREP',
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
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1200, right: 1134, bottom: 1200, left: 1418 },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children,
      },
    ],
  })

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  const buf = await Packer.toBuffer(doc)
  fs.writeFileSync(OUT, buf)
  console.log(`OK ${OUT} (${buf.length} bytes)`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
