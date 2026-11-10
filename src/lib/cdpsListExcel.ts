import ExcelJS from 'exceljs'
import { fmtDateTime } from './format'
import { proyectoConComponenteLabel } from './proyectoLabel'
import { cdpCompAnterior, cdpEstaAnulado, cdpMontoVigente } from './cdpUtils'
import { cdpProyectoSaldoOf, fetchCdpProyectoSaldos, sumUniqueProyectoSaldos } from './cdpsListSaldos'

function nest(v: any): any {
  return Array.isArray(v) ? v[0] : v
}

function proyectoLabel(row: any): string {
  const label = proyectoConComponenteLabel(nest(row.proyecto))
  return label === '—' ? '' : label
}

function usuarioLabel(row: any): string {
  const u = nest(row.usuario)
  return String(u?.name ?? '').trim()
}

const MONEY_FMT = '#,##0'
const HEAD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } }
const HEAD_FONT: Partial<ExcelJS.Font> = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
const FOOT_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF54B451' } }
const FOOT_FONT: Partial<ExcelJS.Font> = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
const THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFC0C0C0' } }
const BORDER: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN }

async function downloadXlsx(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportCdpsListExcel(
  rows: any[],
  opts: { subtitle?: string; filename?: string } = {},
): Promise<void> {
  if (!rows.length) throw new Error('No hay CDP para exportar.')

  const saldos = await fetchCdpProyectoSaldos(rows)
  const totalesProy = sumUniqueProyectoSaldos(rows, saldos)
  const totalVigente = rows.reduce((s, r) => s + cdpMontoVigente(r), 0)
  const anulados = rows.filter(cdpEstaAnulado).length
  const colCount = 10

  const wb = new ExcelJS.Workbook()
  wb.creator = 'GEREP'
  const ws = wb.addWorksheet('CDP', {
    views: [{ state: 'frozen', ySplit: 4 }],
  })

  ws.columns = [
    { width: 8 },
    { width: 16 },
    { width: 18 },
    { width: 44 },
    { width: 20 },
    { width: 14 },
    { width: 14 },
    { width: 22 },
    { width: 20 },
    { width: 12 },
  ]

  ws.mergeCells(1, 1, 1, colCount)
  const title = ws.getCell(1, 1)
  title.value = 'LISTADO DE CDP'
  title.font = { bold: true, size: 14, color: { argb: 'FF2F1C6A' } }
  title.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 22

  ws.mergeCells(2, 1, 2, colCount)
  const sub = ws.getCell(2, 1)
  sub.value = opts.subtitle?.trim() || 'Certificados de disponibilidad presupuestaria'
  sub.font = { size: 10, color: { argb: 'FF475569' } }

  ws.mergeCells(3, 1, 3, colCount)
  const meta = ws.getCell(3, 1)
  const extra = anulados ? ` · ${anulados} anulado${anulados === 1 ? '' : 's'} (no suman)` : ''
  meta.value = `${rows.length} CDP · Comprometido ${totalVigente} · Ejecutado STR ${totalesProy.ejecutadoStr} · Saldo proyecto ${totalesProy.saldoProyecto}${extra}`
  meta.font = { bold: true, size: 10, color: { argb: 'FF2F1C6A' } }

  const headers = [
    'Nro', 'CDP #', 'Fecha CDP', 'Proyecto', 'Usuario', 'Comp. ant.', 'Monto',
    'Ejecutado del proyecto (STR)', 'Saldos del proyecto', 'Estado',
  ]
  const headRow = ws.getRow(4)
  headers.forEach((label, i) => {
    const cell = headRow.getCell(i + 1)
    cell.value = label
    cell.font = HEAD_FONT
    cell.fill = HEAD_FILL
    cell.border = BORDER
    cell.alignment = { horizontal: i >= 5 && i <= 8 ? 'right' : 'center', vertical: 'middle', wrapText: true }
  })
  headRow.height = 28

  rows.forEach((r, idx) => {
    const anulado = cdpEstaAnulado(r)
    const saldo = cdpProyectoSaldoOf(r, saldos)
    const excelRow = ws.addRow([
      idx + 1,
      String(r.cdp_numero ?? '').trim() || 's/n',
      fmtDateTime(r.cdp_date),
      proyectoLabel(r) || null,
      usuarioLabel(r) || null,
      cdpCompAnterior(r, rows),
      Number(r.monto_comprometido) || 0,
      saldo ? saldo.ejecutadoStr : null,
      saldo ? saldo.saldoProyecto : null,
      anulado ? 'Anulado' : 'Activo',
    ])
    excelRow.eachCell((cell, col) => {
      cell.border = BORDER
      cell.font = anulado ? { italic: true, color: { argb: 'FF787878' } } : { size: 10 }
      if (col >= 6 && col <= 9) {
        cell.numFmt = MONEY_FMT
        cell.alignment = { horizontal: 'right' }
      }
    })
  })

  const foot = ws.addRow([
    'TOTAL (ejec./saldo por proyecto y OG, sin duplicar)',
    null, null, null, null, null,
    totalVigente,
    totalesProy.ejecutadoStr,
    totalesProy.saldoProyecto,
    null,
  ])
  ws.mergeCells(foot.number, 1, foot.number, 6)
  foot.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.fill = FOOT_FILL
    cell.font = FOOT_FONT
    cell.border = BORDER
    if (col === 1) cell.alignment = { horizontal: 'right', vertical: 'middle' }
    if (col >= 7 && col <= 9) {
      cell.numFmt = MONEY_FMT
      cell.alignment = { horizontal: 'right' }
    }
  })

  const stamp = new Date().toISOString().slice(0, 10)
  const base = (opts.filename || 'Listado_CDP').replace(/\.xlsx$/i, '')
  await downloadXlsx(wb, `${base}_${stamp}.xlsx`)
}
