import type { FieldDef } from '../components/CrudModule'
import { fmtDate, fmtMoney } from './format'
import { fetchSaldoDisponibleStr, fetchStrSaldoDisponibleMap } from './rendicionSaldos'
import { supabase } from './supabase'

export const TIPO_EXPEDIENTE_GENERAL = 'General'
export const TIPO_EXPEDIENTE_RENDICION = 'Rendición de Cuentas'

export const TIPOS_EXPEDIENTE = [
  { value: TIPO_EXPEDIENTE_GENERAL, label: 'General' },
  { value: TIPO_EXPEDIENTE_RENDICION, label: 'Rendición de Cuentas' },
] as const

export type DatosRendicion = {
  str_id?: string | null
  str_numero?: string | null
  monto?: number | null
  observaciones?: string | null
}

type StrRow = {
  id: string
  numero?: string | null
  fecha?: string | null
  monto?: number | null
  fecha_desembolso?: string | null
  fecha_rendicion?: string | null
  nro_ot?: string | null
  proyecto?: { descripcion?: string | null } | { descripcion?: string | null }[] | null
}

export function isRendicionExpediente(tipo: string | null | undefined): boolean {
  return String(tipo ?? '').trim() === TIPO_EXPEDIENTE_RENDICION
}

const OBS_AUTO_SEG = /(?:^|\s*·\s*)(?:OT\s+\S+|Fecha de Transferencia:\s*[^\s·]+)/gi

/** OT y fecha de transferencia (solo desembolso). No mezcla la fecha de la STR. */
export function observacionesFromStr(
  str: { nro_ot?: string | null; fecha_desembolso?: string | null; fecha?: string | null },
  extra?: string | null,
  formatFecha: (v: string) => string = fmtDate,
): string {
  const bits: string[] = []
  const ot = String(str.nro_ot ?? '').trim()
  if (ot) bits.push(`OT ${ot}`)
  const fechaRaw = String(str.fecha_desembolso ?? '').trim()
  if (fechaRaw) bits.push(`Fecha de Transferencia: ${formatFecha(fechaRaw)}`)
  const extraT = String(extra ?? '')
    .replace(OBS_AUTO_SEG, '')
    .replace(/\s*·\s*·\s*/g, ' · ')
    .replace(/^\s*·\s*|\s*·\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return [bits.join(' · '), extraT].filter(Boolean).join(' · ')
}

function asuntoEsDefault(asunto: string): boolean {
  const t = asunto.replace(/\s+/g, ' ').trim()
  return !t || /^RENDICI[OÓ]N DE CUENTAS(?:\s*·.*)?$/i.test(t)
}

function proyectoNombre(str: StrRow): string {
  const p = Array.isArray(str.proyecto) ? str.proyecto[0] : str.proyecto
  return String(p?.descripcion ?? '').trim()
}

function cleanDuplicatedAutoObs(raw: string): string {
  const parts = String(raw ?? '').split(/\s*·\s*/).map(p => p.trim()).filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const key = /^fecha de transferencia:/i.test(p) ? 'fecha-transf' : /^ot\s+/i.test(p) ? 'ot' : `x:${p.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out.join(' · ')
}

export function flattenDatosRendicion<T extends Record<string, any>>(row: T): T & Record<string, any> {
  const raw = row.datos_rendicion
  const d: DatosRendicion = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    ...row,
    tipo: row.tipo || TIPO_EXPEDIENTE_GENERAL,
    rc_str_id: d.str_id ?? '',
    rc_str_numero: d.str_numero ?? '',
    rc_monto: d.monto ?? '',
    rc_observaciones: cleanDuplicatedAutoObs(String(d.observaciones ?? '')),
  }
}

export function expedienteSchemaHint(error: { message?: string } | null | undefined): string | null {
  const msg = String(error?.message ?? '')
  if (/column .*tipo|datos_rendicion|schema cache/i.test(msg)) {
    return 'Falta aplicar en Supabase la migración 043_expedientes_tipo_rendicion.sql (columnas tipo y datos_rendicion).'
  }
  if (/solo los desarrolladores pueden reabrir/i.test(msg)) {
    return 'Falta aplicar en Supabase la migración 044_expedientes_reabrir_admin_dev.sql (administrador y desarrollador pueden reabrir).'
  }
  return null
}

export function packExpedientePayload(values: Record<string, any>): Record<string, any> {
  const {
    rc_str_id,
    rc_str_numero,
    rc_monto,
    rc_observaciones,
    datos_rendicion: _ignore,
    ...rest
  } = values
  const tipo = String(rest.tipo ?? TIPO_EXPEDIENTE_GENERAL).trim() || TIPO_EXPEDIENTE_GENERAL
  rest.tipo = tipo
  if (tipo === TIPO_EXPEDIENTE_RENDICION) {
    const monto = rc_monto === '' || rc_monto == null ? null : Number(rc_monto)
    rest.datos_rendicion = {
      str_id: String(rc_str_id ?? '').trim() || null,
      str_numero: String(rc_str_numero ?? '').trim() || null,
      monto: Number.isFinite(monto) ? monto : null,
      observaciones: cleanDuplicatedAutoObs(String(rc_observaciones ?? '').trim()) || null,
    } satisfies DatosRendicion
  } else {
    rest.datos_rendicion = null
  }
  return rest
}

/** Completa N° STR y datos faltantes desde la STR vinculada. */
export async function ensureDatosRendicionStrNumero(payload: Record<string, any>): Promise<Record<string, any>> {
  const d = payload.datos_rendicion as DatosRendicion | null | undefined
  if (!d?.str_id) return payload
  if (d.str_numero && d.monto != null) return payload
  const patch = await formPatchFromStrId(d.str_id, {})
  if (!d.str_numero && patch.rc_str_numero) d.str_numero = String(patch.rc_str_numero)
  if (d.monto == null && patch.rc_monto !== '' && patch.rc_monto != null) {
    const n = Number(patch.rc_monto)
    if (Number.isFinite(n)) d.monto = n
  }
  return payload
}

export function rendicionDatosFromRow(row: { tipo?: string | null; datos_rendicion?: DatosRendicion | null }): DatosRendicion | null {
  if (!isRendicionExpediente(row.tipo)) return null
  const d = row.datos_rendicion
  if (!d || typeof d !== 'object') return {}
  return d
}

export async function formPatchFromStrId(
  strId: string | null | undefined,
  current?: Record<string, any>,
): Promise<Record<string, any>> {
  const id = String(strId ?? '').trim()
  if (!id) {
    const patch: Record<string, any> = {
      rc_str_id: '',
      rc_str_numero: '',
      rc_monto: '',
    }
    if (asuntoEsDefault(String(current?.asunto ?? ''))) {
      patch.asunto = 'RENDICIÓN DE CUENTAS'
    }
    return patch
  }

  const { data, error } = await supabase
    .from('strs')
    .select('id, numero, fecha, monto, fecha_desembolso, fecha_rendicion, nro_ot, proyecto:proyectos(descripcion)')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return { rc_str_id: id }

  const str = data as StrRow
  let monto: number | null = str.monto == null ? null : Number(str.monto)
  try {
    const saldo = await fetchSaldoDisponibleStr(id, Number(str.monto) || 0)
    if (Number.isFinite(saldo) && saldo > 0) monto = saldo
  } catch {
    /* usar monto de la STR */
  }

  const patch: Record<string, any> = {
    rc_str_id: str.id,
    rc_str_numero: str.numero ?? '',
    rc_monto: monto != null && Number.isFinite(monto) ? monto : '',
  }

  if (asuntoEsDefault(String(current?.asunto ?? ''))) {
    const proy = proyectoNombre(str)
    patch.asunto = proy
      ? `RENDICIÓN DE CUENTAS · STR ${str.numero} · ${proy}`
      : `RENDICIÓN DE CUENTAS · STR ${str.numero}`
  }

  const obs = observacionesFromStr(str, current?.rc_observaciones)
  if (obs) patch.rc_observaciones = obs

  return patch
}

export async function formPatchFromStrNumero(
  numero: string | null | undefined,
  current?: Record<string, any>,
): Promise<Record<string, any>> {
  const q = String(numero ?? '').replace(/^STR\s*/i, '').trim()
  const safe = q.replace(/[%*,()]/g, '').slice(0, 32)
  if (!safe) return {}
  const { data } = await supabase
    .from('strs')
    .select('id, monto')
    .ilike('numero', `%${safe}%`)
    .limit(10)
  const rows = (data ?? []) as { id: string; monto?: number | null }[]
  if (!rows.length) return { rc_str_numero: q }
  const saldoByStr = await fetchStrSaldoDisponibleMap(rows)
  const withSaldo = rows.find(r => (saldoByStr.get(String(r.id)) ?? 0) > 0.009)
  if (!withSaldo) return { rc_str_numero: q }
  return formPatchFromStrId(withSaldo.id, current)
}

export function expedienteTipoFields(): FieldDef[] {
  return [
    {
      name: 'tipo',
      label: 'Tipo de expediente',
      type: 'select',
      required: true,
      options: TIPOS_EXPEDIENTE.map(o => ({ value: o.value, label: o.label })),
      defaultValue: TIPO_EXPEDIENTE_GENERAL,
      derive: (value, values) => {
        if (value === TIPO_EXPEDIENTE_RENDICION && !String(values.asunto ?? '').trim()) {
          return { asunto: 'RENDICIÓN DE CUENTAS' }
        }
        return {}
      },
    },
    {
      name: 'rc_str_id',
      label: 'N° STR',
      type: 'fk',
      required: true,
      visibleIf: v => isRendicionExpediente(v.tipo),
      fk: {
        table: 'strs',
        select: 'id, numero, fecha, monto, fecha_desembolso, fecha_rendicion',
        label: (r: any) => `STR ${r.numero ?? '—'}`,
        sub: (r: any) => `${fmtDate(r.fecha)} · ${fmtMoney(r.monto)}`,
        orderBy: 'fecha',
        orderAscending: false,
        fetchAll: true,
        limit: 20_000,
        enrichOptions: async (options, rows, values) => {
          if (!options.length) return options
          const saldoByStr = await fetchStrSaldoDisponibleMap(
            rows.map((r: any) => ({ id: String(r.id), monto: r.monto })),
          )
          const selected = String(values.rc_str_id ?? '').trim()
          return options.flatMap(o => {
            const saldo = saldoByStr.get(o.value) ?? 0
            if (saldo <= 0.009 && o.value !== selected) return []
            return [{
              ...o,
              label: `${o.label} · Saldo ${fmtMoney(saldo)}`,
              sub: saldo <= 0.009
                ? 'Sin saldo pendiente (ya vinculada)'
                : o.sub
                  ? `${o.sub} · Pendiente a rendir`
                  : 'Pendiente a rendir',
            }]
          })
        },
      },
      derive: (value, values) => formPatchFromStrId(value, values),
    },
    {
      name: 'rc_monto',
      label: 'Monto de la rendición',
      type: 'money',
      visibleIf: v => isRendicionExpediente(v.tipo),
    },
    {
      name: 'rc_observaciones',
      label: 'Observaciones',
      type: 'textarea',
      colSpan2: true,
      visibleIf: v => isRendicionExpediente(v.tipo),
    },
  ]
}
