import type { CrudConfig } from '../components/CrudModule'
import { Badge } from '../components/ui'
import ArchivoAdjuntoLink from '../components/ArchivoAdjuntoLink'
import MemoPersonasFields from '../components/MemoPersonasFields'
import { fmtDate } from '../lib/format'
import { STORAGE_BUCKET_MEMO_ARCHIVOS } from '../lib/storage'
import { compareMemoNumero, displayMemoNumero, fetchNextMemoNumero, normalizeMemoNumero, yearFromMemoFecha } from '../lib/memoNumero'
import { parseCcPersonas, peekMemoPersonasDraft, personaLabel, normalizeMemoPersona, resetMemoPersonasDraft } from '../lib/memoPersonas'
import { supabase } from '../lib/supabase'

function htmlToSearchText(html: unknown): string {
  const raw = String(html ?? '')
  if (!raw.trim()) return ''
  if (typeof document === 'undefined') {
    return raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
  }
  const el = document.createElement('div')
  el.innerHTML = raw.replace(/<img\b[^>]*>/gi, ' ')
  return (el.textContent || '').replace(/\s+/g, ' ').trim()
}

function foldSearch(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function memoSearchHaystack(row: any): string {
  return foldSearch([
    row.numero,
    row.asunto,
    row.de_nombre,
    row.de_cargo,
    row.para_nombre,
    row.para_cargo,
    ...(Array.isArray(row.cc_labels) ? row.cc_labels : []),
    row.cuerpo_plain,
  ].filter(Boolean).join('\n'))
}

function uuidOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null
}

function personaCell(nombre: unknown, cargo: unknown, fallback?: { nombre_completo?: string | null; cargo?: string | null } | null) {
  const n = String(nombre || fallback?.nombre_completo || '').trim()
  const c = String(cargo || fallback?.cargo || '').trim()
  if (!n) return '—'
  return (
    <span className="block leading-tight">
      <span className="block">{n}</span>
      {c ? <span className="block text-[11px] text-slate-500">{c}</span> : null}
    </span>
  )
}

export function memosConfig(): CrudConfig {
  return {
    table: 'memos',
    eyebrow: 'Mesa de entrada',
    title: 'Memos',
    singular: 'Memorándum',
    subtitle: 'Elaborar, modificar, imprimir y adjuntar el memorándum firmado',
    select: '*',
    orderBy: { column: 'fecha', ascending: false },
    limit: 5000,
    pageSize: 20,
    userIdField: 'created_by',
    modalWide: true,
    emptyHint: 'Cree el primer memorándum con el botón Memorándum.',
    searchPlaceholder: 'Buscar n°, asunto, cuerpo…',
    searchFn: (row, term) => {
      const q = foldSearch(term).trim()
      if (!q) return true
      return memoSearchHaystack(row).includes(q)
    },
    transformRows: async rows => {
      const sorted = [...rows].sort((a, b) => {
        const byNum = compareMemoNumero(b?.numero, a?.numero)
        if (byNum) return byNum
        return String(b?.fecha ?? '').localeCompare(String(a?.fecha ?? ''))
      })
      const ids = [
        ...new Set(
          sorted.flatMap(r => [
            r.de_funcionario_id,
            r.para_funcionario_id,
            ...(r.cc_funcionario_ids ?? []),
          ].map(id => (id == null ? '' : String(id))).filter(Boolean)),
        ),
      ]
      let byId: Record<string, any> = {}
      if (ids.length) {
        const { data } = await supabase
          .from('funcionarios')
          .select('id,nombre_completo,cargo,area:areas(nombre)')
          .in('id', ids)
        byId = Object.fromEntries((data ?? []).map(f => [String(f.id), f]))
      }
      return sorted.map(r => {
        const de = byId[String(r.de_funcionario_id)] ?? null
        const para = byId[String(r.para_funcionario_id)] ?? null
        const ccParsed = parseCcPersonas(r.cc_personas, r.cc_otros)
        const fromCat = (r.cc_funcionario_ids ?? [])
          .map((id: string) => personaLabel({
            nombre: byId[String(id)]?.nombre_completo,
            cargo: byId[String(id)]?.cargo,
          }))
          .filter((s: string) => s && s !== '—')
        const ccLabels = ccParsed.length
          ? ccParsed.map(p => personaLabel(p)).filter(s => s !== '—')
          : fromCat
        return {
          ...r,
          de,
          para,
          de_nombre: r.de_nombre || de?.nombre_completo || '',
          de_cargo: r.de_cargo || de?.cargo || '',
          para_nombre: r.para_nombre || para?.nombre_completo || '',
          para_cargo: r.para_cargo || para?.cargo || '',
          cc_labels: ccLabels,
          cuerpo_plain: htmlToSearchText(r.cuerpo),
        }
      })
    },
    resolveCreateInitial: async () => {
      resetMemoPersonasDraft()
      const now = new Date()
      const fecha = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const numero = await fetchNextMemoNumero(yearFromMemoFecha(fecha)).catch(() => '')
      return {
        fecha,
        ...(numero ? { numero } : {}),
        cuerpo: '<p class="ql-align-justify" style="line-height: 1.5;">Me dirijo a Usted, y por su intermedio a quienes corresponda, a fin de </p>',
      }
    },
    resolveCloneInitial: async (row: any) => {
      const now = new Date()
      const fecha = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const numero = await fetchNextMemoNumero(yearFromMemoFecha(fecha)).catch(() => '')
      const de = normalizeMemoPersona({
        nombre: row.de_nombre || row.de?.nombre_completo,
        cargo: row.de_cargo || row.de?.cargo,
        funcionarioId: row.de_funcionario_id,
      })
      const para = normalizeMemoPersona({
        nombre: row.para_nombre || row.para?.nombre_completo,
        cargo: row.para_cargo || row.para?.cargo,
        funcionarioId: row.para_funcionario_id,
      })
      const cc = parseCcPersonas(row.cc_personas, row.cc_otros)
      resetMemoPersonasDraft({ de, para, cc })
      return {
        _clonedFrom: row.numero || row.id,
        fecha,
        ...(numero ? { numero } : {}),
        asunto: row.asunto ?? '',
        cuerpo: row.cuerpo ?? '',
        de_nombre: de.nombre,
        de_cargo: de.cargo,
        de_funcionario_id: de.funcionarioId,
        para_nombre: para.nombre,
        para_cargo: para.cargo,
        para_funcionario_id: para.funcionarioId,
        cc_personas: cc,
        cc_funcionario_ids: row.cc_funcionario_ids ?? [],
        cc_otros: row.cc_otros ?? [],
      }
    },
    beforeSave: async ({ values, isCreate }) => {
      const personas = peekMemoPersonasDraft()
      if (!personas.de.nombre) throw new Error('Complete De (nombre).')
      if (!personas.para.nombre) throw new Error('Complete Para (nombre).')
      let numero = normalizeMemoNumero(values.numero)
      if (!numero && isCreate) {
        numero = await fetchNextMemoNumero(yearFromMemoFecha(values.fecha))
      }
      if (!numero) {
        throw new Error('El N° es obligatorio (formato 001/2026).')
      }
      const cc = personas.cc.filter(p => p.nombre)
      const { _clonedFrom: _ignored, ...rest } = values as Record<string, any>
      return {
        ...rest,
        numero,
        de_nombre: personas.de.nombre,
        de_cargo: personas.de.cargo || null,
        de_funcionario_id: uuidOrNull(personas.de.funcionarioId),
        para_nombre: personas.para.nombre,
        para_cargo: personas.para.cargo || null,
        para_funcionario_id: uuidOrNull(personas.para.funcionarioId),
        cc_personas: cc.map(p => ({
          nombre: p.nombre,
          cargo: p.cargo,
          funcionarioId: uuidOrNull(p.funcionarioId),
        })),
        cc_funcionario_ids: cc.map(p => uuidOrNull(p.funcionarioId)).filter(Boolean),
        cc_otros: cc.filter(p => !uuidOrNull(p.funcionarioId)).map(p => personaLabel(p)),
      }
    },
    formExtra: ({ initial }) => <MemoPersonasFields initial={initial} />,
    columns: [
      {
        key: 'numero',
        label: 'N°',
        sortFn: (a, b) => compareMemoNumero(a?.numero, b?.numero),
        defaultAsc: false,
        render: (r: any) => <Badge color="brand">{displayMemoNumero(r.numero)}</Badge>,
      },
      { key: 'fecha', label: 'Fecha', render: (r: any) => fmtDate(r.fecha) },
      {
        key: 'de_nombre',
        label: 'De',
        sortKey: 'de_nombre',
        render: (r: any) => personaCell(r.de_nombre, r.de_cargo, r.de),
      },
      {
        key: 'para_nombre',
        label: 'Para',
        sortKey: 'para_nombre',
        render: (r: any) => personaCell(r.para_nombre, r.para_cargo, r.para),
      },
      {
        key: 'cc_labels',
        label: 'CC',
        sortable: false,
        render: (r: any) => {
          const labels: string[] = r.cc_labels ?? []
          if (!labels.length) return '—'
          return (
            <span className="line-clamp-2 text-xs text-slate-600" title={labels.join(', ')}>
              {labels.join(' · ')}
            </span>
          )
        },
      },
      { key: 'asunto', label: 'Asunto', className: 'min-w-[14rem]', render: (r: any) => r.asunto || '—' },
      {
        key: 'archivo_firmado',
        label: 'Firmado',
        align: 'center',
        sortable: false,
        render: (r: any) => (
          <ArchivoAdjuntoLink
            path={r.archivo_firmado}
            bucket={STORAGE_BUCKET_MEMO_ARCHIVOS}
            badgeCount={r.archivo_firmado ? 1 : 0}
          />
        ),
      },
    ],
    fields: [
      {
        name: 'numero',
        label: 'N°',
        type: 'text',
        required: true,
        placeholder: '001/2026',
      },
      { name: 'fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'asunto', label: 'Asunto', type: 'text', required: true, colSpan2: true, formSection: 'end', placeholder: 'Solicitud de…' },
      {
        name: 'cuerpo',
        label: 'Cuerpo del memorándum',
        type: 'richtext',
        required: true,
        colSpan2: true,
        formSection: 'end',
        richTextVariant: 'document',
        placeholder: 'Redacte el oficio. Puede insertar tablas (filas y columnas), listas, imágenes y formato; el PDF las respeta.',
      },
    ],
  }
}
