import ExcelJS from 'exceljs'

export interface ExcelColumn {
  key: string
  label: string
  excelValue?: (row: any) => string | number | boolean | null | undefined
}

/** Banda superior de cabecera (celdas combinadas sobre columnas hoja). */
export interface ExcelHeaderGroup {
  label: string
  /** Cantidad de columnas hoja que abarca (1 = celda vertical Item-style). */
  span: number
}

function getPath(row: any, key: string): unknown {
  return key.split('.').reduce((acc: any, k) => (acc == null ? acc : acc[k]), row)
}

function formatObject(v: Record<string, unknown>): string {
  if (typeof v.razon_social === 'string') return v.razon_social
  if (typeof v.name === 'string') return v.name
  if (typeof v.numero === 'string' || typeof v.numero === 'number') return String(v.numero)
  if (typeof v.numero_expediente === 'string') return v.numero_expediente
  if (typeof v.cdp_numero === 'string') return v.cdp_numero
  if (typeof v.codigo === 'string' && typeof v.descripcion === 'string') {
    return `${v.codigo} — ${v.descripcion}`
  }
  if (typeof v.codigo === 'string') return v.codigo
  if (typeof v.descripcion === 'string') return v.descripcion
  if (typeof v.label === 'string') return v.label
  return Object.values(v)
    .filter(x => x != null && (typeof x === 'string' || typeof x === 'number'))
    .slice(0, 3)
    .join(' · ')
}

/** Valor tabular plano para Excel a partir de una columna de CrudModule. */
export function excelCellValue(
  row: any,
  key: string,
  excelValue?: ExcelColumn['excelValue'],
): string | number | boolean | null {
  if (excelValue) {
    const custom = excelValue(row)
    if (custom == null || custom === '') return null
    return custom
  }
  const v = getPath(row, key)
  if (v == null || v === '') return null
  if (typeof v === 'number' || typeof v === 'boolean') return v
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    const parts = v.map(item => {
      if (item == null) return ''
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return String(item)
      if (typeof item === 'object') {
        const p = (item as any).proyecto
        const proy = Array.isArray(p) ? p[0] : p
        if (proy?.descripcion) return String(proy.descripcion)
        return formatObject(item as Record<string, unknown>) || ''
      }
      return ''
    }).filter(Boolean)
    return parts.length ? parts.join('; ') : null
  }
  if (typeof v === 'object') return formatObject(v as Record<string, unknown>) || null
  return String(v)
}

function safeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80) || 'listado'
}

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<void> {
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

export async function exportRowsToExcel(
  rows: any[],
  columns: ExcelColumn[],
  opts?: {
    sheetName?: string
    filename?: string
    /** Cabecera de dos filas (grupo + subcolumnas). La suma de span debe = columns.length. */
    headerGroups?: ExcelHeaderGroup[]
  },
): Promise<void> {
  const headers = columns.filter(c => !c.key.startsWith('__') && c.key !== 'archivo_url' && c.key !== 'archivo_adjunto')
  const groups = opts?.headerGroups
  const useGroups = Boolean(
    groups?.length
    && groups.reduce((s, g) => s + g.span, 0) === headers.length,
  )

  const wb = new ExcelJS.Workbook()
  const sheetName = (opts?.sheetName ?? 'Listado').slice(0, 31)
  const ws = wb.addWorksheet(sheetName)

  const headFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF2F2F2' },
  }
  const headFont: Partial<ExcelJS.Font> = { bold: true, size: 10 }
  const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } }
  const headBorder: Partial<ExcelJS.Borders> = {
    top: thin, left: thin, bottom: thin, right: thin,
  }

  if (headers.length) {
    ws.columns = headers.map(c => ({
      key: c.key,
      width: Math.min(40, Math.max(12, c.label.length + 2)),
    }))
  }

  if (useGroups && groups) {
    const top = ws.addRow(headers.map(() => ''))
    const sub = ws.addRow(headers.map(c => c.label))
    let col = 1
    for (const g of groups) {
      const start = col
      const end = col + g.span - 1
      const cell = ws.getCell(1, start)
      cell.value = g.label
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.font = headFont
      cell.fill = headFill
      cell.border = headBorder
      if (g.span === 1) {
        ws.mergeCells(1, start, 2, start)
        sub.getCell(start).value = null
      } else {
        if (end > start) ws.mergeCells(1, start, 1, end)
        for (let i = start; i <= end; i++) {
          const topCell = ws.getCell(1, i)
          topCell.fill = headFill
          topCell.border = headBorder
          topCell.font = headFont
          const subCell = ws.getCell(2, i)
          subCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          subCell.font = headFont
          subCell.fill = headFill
          subCell.border = headBorder
        }
      }
      col = end + 1
    }
    top.height = 18
    sub.height = 30

    if (rows.length) {
      for (const row of rows) {
        ws.addRow(headers.map(c => excelCellValue(row, c.key, c.excelValue)))
      }
    } else {
      ws.addRow(headers.map(() => null))
    }
  } else {
    if (headers.length) {
      ws.columns = headers.map(c => ({
        header: c.label,
        key: c.label,
        width: Math.min(40, Math.max(12, c.label.length + 2)),
      }))
    }
    const sheetRows = rows.map(row => {
      const obj: Record<string, string | number | boolean | null> = {}
      for (const col of headers) {
        obj[col.label] = excelCellValue(row, col.key, col.excelValue)
      }
      return obj
    })
    if (sheetRows.length) {
      for (const row of sheetRows) ws.addRow(row)
    } else {
      ws.addRow(Object.fromEntries(headers.map(c => [c.label, null])))
    }
  }

  const stamp = new Date().toISOString().slice(0, 10)
  await downloadWorkbook(wb, `${safeFilename(opts?.filename ?? opts?.sheetName ?? 'listado')}_${stamp}`)
}
