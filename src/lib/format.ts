const gs = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 })

/** Guaraníes enteros (evita residuos de punto flotante tipo -0.01 → “-0”). */
export function asGs(v: number | string | null | undefined): number {
  const n = Math.round(Number(v) || 0)
  return n === 0 ? 0 : n
}

export function fmtMoney(v: number | null | undefined): string {
  if (v == null) return '—'
  return '₲ ' + gs.format(asGs(v))
}

/** Formato ASCII para PDF (Helvetica no soporta ₲ ni separadores Unicode de Intl). */
export function fmtMoneyPdf(v: number | null | undefined): string {
  if (v == null) return '-'
  const n = Math.round(Number(v) || 0)
  const abs = Math.abs(n)
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${n < 0 ? '-' : ''}${formatted} Gs.`
}

export function fmtMoneyCompact(v: number | null | undefined): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return '₲ ' + (v / 1_000_000_000).toFixed(1).replace('.', ',') + ' mil M'
  if (abs >= 1_000_000) return '₲ ' + (v / 1_000_000).toFixed(1).replace('.', ',') + ' M'
  return fmtMoney(v)
}

export type DbDateParts = {
  y: number
  m: number
  d: number
  hh: number | null
  mm: number | null
  ss: number | null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** True si el ISO trae zona horaria explícita (Z / ±HH:MM), típico de timestamptz de Supabase. */
function hasExplicitTimezone(s: string): boolean {
  return /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(s.trim())
}

/**
 * Extrae fecha/hora tal como vienen en el string de la BD (ISO / Postgres),
 * sin convertir por zona horaria del navegador.
 */
export function parseDbDateParts(v: string | null | undefined): DbDateParts | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?/,
  )
  if (!m) return null
  return {
    y: Number(m[1]),
    m: Number(m[2]),
    d: Number(m[3]),
    hh: m[4] != null ? Number(m[4]) : null,
    mm: m[5] != null ? Number(m[5]) : null,
    ss: m[6] != null ? Number(m[6]) : null,
  }
}

/**
 * Partes para mostrar fecha+hora al usuario (zona del navegador).
 * Timestamptz con TZ → hora local. Valor naive → componentes tal cual.
 */
export function parseDisplayDateParts(v: string | null | undefined): DbDateParts | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  if (hasExplicitTimezone(s)) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) {
      return {
        y: d.getFullYear(),
        m: d.getMonth() + 1,
        d: d.getDate(),
        hh: d.getHours(),
        mm: d.getMinutes(),
        ss: d.getSeconds(),
      }
    }
  }
  return parseDbDateParts(s)
}

function hasClockTime(s: string): boolean {
  const p = parseDbDateParts(s)
  if (!p || p.hh == null) return false
  return p.hh !== 0 || (p.mm ?? 0) !== 0 || (p.ss ?? 0) !== 0
}

/**
 * Fecha de calendario sin corrimiento de zona.
 * Para columnas `date` o valores “solo día”: usa YYYY-MM-DD del string.
 * Si es timestamptz con hora real, usa el día en zona local del usuario.
 */
export function parseCalendarDateParts(v: string | null | undefined): DbDateParts | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  if (hasExplicitTimezone(s) && hasClockTime(s)) {
    const p = parseDisplayDateParts(s)
    if (!p) return null
    return { ...p, hh: null, mm: null, ss: null }
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    return {
      y: Number(m[1]),
      m: Number(m[2]),
      d: Number(m[3]),
      hh: null,
      mm: null,
      ss: null,
    }
  }
  const p = parseDisplayDateParts(s)
  if (!p) return null
  return { ...p, hh: null, mm: null, ss: null }
}

/** Fecha DD/MM/AAAA (día de calendario guardado; sin corrimiento UTC). */
export function fmtDate(v: string | null | undefined): string {
  const p = parseCalendarDateParts(v)
  if (!p) return '—'
  return `${pad2(p.d)}/${pad2(p.m)}/${p.y}`
}

/** Fecha ASCII para PDF; vacío muestra '---'. Formato DD-MM-YYYY. */
export function fmtDatePdf(v: string | null | undefined): string {
  const p = parseCalendarDateParts(v)
  if (!p) return '---'
  return `${pad2(p.d)}-${pad2(p.m)}-${p.y}`
}

/** Fecha y hora DD/MM/AAAA HH:mm en hora local del usuario. */
export function fmtDateTime(v: string | null | undefined): string {
  const p = parseDisplayDateParts(v)
  if (!p) return '—'
  if (p.hh == null) return `${pad2(p.d)}/${pad2(p.m)}/${p.y}`
  return `${pad2(p.d)}/${pad2(p.m)}/${p.y} ${pad2(p.hh)}:${pad2(p.mm ?? 0)}`
}

/** Fecha y hora ASCII para PDF (misma lógica local que la vista). */
export function fmtDateTimePdf(v: string | null | undefined): string {
  const p = parseDisplayDateParts(v)
  if (!p) return '---'
  if (p.hh == null) return `${pad2(p.d)}-${pad2(p.m)}-${p.y}`
  return `${pad2(p.d)}-${pad2(p.m)}-${p.y} ${pad2(p.hh)}:${pad2(p.mm ?? 0)}`
}

/** Valor para input[type=date]: YYYY-MM-DD (calendario, sin corrimiento). */
export function toDateInputValue(v: string | null | undefined): string {
  const p = parseCalendarDateParts(v)
  if (!p) return ''
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`
}

/** Valor para input[type=datetime-local]: YYYY-MM-DDTHH:mm (hora local). */
export function toDatetimeLocalValue(v: string | null | undefined): string {
  const p = parseDisplayDateParts(v)
  if (!p) return ''
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}T${pad2(p.hh ?? 0)}:${pad2(p.mm ?? 0)}`
}

/** ISO local con offset (±HH:MM) para el instante dado. */
export function formatLocalIso(d: Date): string {
  const y = d.getFullYear()
  const mo = pad2(d.getMonth() + 1)
  const da = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const mm = pad2(d.getMinutes())
  const ss = pad2(d.getSeconds())
  const offsetMin = -d.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const oh = pad2(Math.floor(abs / 60))
  const om = pad2(abs % 60)
  return `${y}-${mo}-${da}T${hh}:${mm}:${ss}${sign}${oh}:${om}`
}

/**
 * Serializa el valor del formulario para guardar en timestamptz
 * conservando la fecha/hora que el usuario eligió (con offset local).
 * datetime-local "2026-07-12T15:30" → "2026-07-12T15:30:00-03:00" (ej. Paraguay)
 */
export function fromDatetimeLocalValue(v: string | null | undefined): string | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return s
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const hh = Number(m[4])
  const mm = Number(m[5])
  const ss = Number(m[6] ?? '0')
  const local = new Date(y, mo - 1, d, hh, mm, ss)
  if (Number.isNaN(local.getTime())) {
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}`
  }
  return formatLocalIso(local)
}

/** Ahora local del equipo, para defaults de formularios (sin UTC). */
export function nowDateInputValue(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function nowDatetimeLocalValue(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Ahora listo para insertar en columnas timestamptz (con offset local). */
export function nowTimestamptz(): string {
  return formatLocalIso(new Date())
}

/** YYYY-MM-DD de calendario (para filtros / rangos), sin corrimiento. */
export function dateOnlyIso(v: string | null | undefined): string {
  const p = parseCalendarDateParts(v)
  if (!p) return ''
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`
}

export function txtPdf(v: string | null | undefined): string {
  const s = (v ?? '').trim()
  return s || '---'
}

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function fmtMes(m: number | null | undefined): string {
  if (!m || m < 1 || m > 12) return '—'
  return MESES[m - 1]
}

/**
 * Suma días hábiles (lun–vie) a una fecha YYYY-MM-DD.
 * No contempla feriados.
 */
export function addBusinessDays(dateStr: string, businessDays: number): string {
  const raw = (dateStr ?? '').trim()
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!y || !mo || !d) return ''

  const date = new Date(y, mo - 1, d)
  if (Number.isNaN(date.getTime())) return ''

  let remaining = Math.max(0, Math.floor(businessDays))
  while (remaining > 0) {
    date.setDate(date.getDate() + 1)
    const dow = date.getDay() // 0=domingo, 6=sábado
    if (dow !== 0 && dow !== 6) remaining -= 1
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}
