export type TurucContribuyente = {
  doc: number
  razonSocial: string
  dv: number
  ruc: string
  estado: string
  esPersonaJuridica: boolean
  esEntidadPublica: boolean
}

export type TurucLookupResult =
  | { ok: true; data: TurucContribuyente }
  | { ok: false; message: string }

/** Extrae solo el número de documento (sin DV) para la API TuRUC. */
export function normalizeRucQuery(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, '')
  if (!cleaned) return ''
  const withDv = cleaned.match(/^(\d{4,8})-?\d?$/)
  if (withDv) return withDv[1]
  return cleaned.replace(/\D/g, '')
}

/**
 * Convierte "APELLIDO, NOMBRE" → "NOMBRE APELLIDO" (sin coma).
 * Si no hay coma, deja el texto tal cual (empresas).
 */
export function formatRazonSocialDisplay(razonSocial: string): string {
  const raw = (razonSocial ?? '').trim().replace(/\s+/g, ' ')
  if (!raw) return ''
  const comma = raw.indexOf(',')
  if (comma === -1) return raw
  const apellidos = raw.slice(0, comma).trim()
  const nombres = raw.slice(comma + 1).trim()
  if (nombres && apellidos) return `${nombres} ${apellidos}`
  return `${nombres} ${apellidos}`.trim()
}

/**
 * Consulta contribuyente en https://turuc.com.py/api/contribuyente/{ruc}
 * El path espera el RUC sin dígito verificador.
 */
export async function lookupTurucContribuyente(rucOrDoc: string): Promise<TurucLookupResult> {
  const doc = normalizeRucQuery(rucOrDoc)
  if (!doc || doc.length < 4) {
    return { ok: false, message: 'Ingrese un RUC válido (solo números, con o sin DV).' }
  }

  const url = `https://turuc.com.py/api/contribuyente/${encodeURIComponent(doc)}`
  try {
    const res = await fetch(url)
    const body = await res.json().catch(() => null) as
      | { data?: TurucContribuyente | null; message?: string }
      | null

    if (!res.ok || !body?.data) {
      return {
        ok: false,
        message: body?.message || `No se encontró el contribuyente (${res.status}).`,
      }
    }

    const data = {
      ...body.data,
      razonSocial: formatRazonSocialDisplay(body.data.razonSocial),
    }
    return { ok: true, data }
  } catch {
    return { ok: false, message: 'No se pudo consultar TuRUC. Verifique su conexión.' }
  }
}
