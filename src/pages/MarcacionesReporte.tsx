import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router'
import { Download, Filter, RefreshCw, Users, CalendarDays, Clock, AlertCircle, FileText } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { canConfigureAsistencia } from '../lib/roles'
import { loadMarcacionesReporte, formatHoraLocal, localDayKeyFromHora, type AsistenciaMarcacion } from '../lib/asistencia'
import { supabase } from '../lib/supabase'
import { Card, PageHeader, Spinner, StatCard } from '../components/ui'
import { Label, TextInput, SelectInput } from '../components/fields'
import { fmtDate } from '../lib/format'
import { exportRowsToExcel } from '../lib/exportTableExcel'
import { exportMarcacionesPdf } from '../lib/marcacionesPdf'

function toDateInput(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dayKeyFromHora(hora: string): string {
  return localDayKeyFromHora(hora)
}

function fmtHoraOnly(hora: string | null | undefined): string {
  return formatHoraLocal(hora)
}

function isEntradaTipo(tipo: string | null | undefined) {
  return (tipo ?? '').toLowerCase().includes('entrada')
}

function isSalidaTipo(tipo: string | null | undefined) {
  return (tipo ?? '').toLowerCase().includes('salida')
}

function msFromHora(hora: string): number {
  const t = Date.parse(hora)
  return Number.isFinite(t) ? t : 0
}

function fmtDuracionHoras(ms: number | null): string {
  if (ms == null || ms < 0) return '—'
  const horas = ms / 3_600_000
  return `${horas.toFixed(2).replace('.', ',')} h`
}

type JornadaRow = {
  key: string
  fecha: string
  usuarioId: string
  usuarioName: string
  usuarioEmail: string
  entrada: AsistenciaMarcacion | null
  salida: AsistenciaMarcacion | null
  duracionMs: number | null
}

/** Empareja entrada + salida del mismo usuario y día (FIFO). */
function agruparJornadas(rows: AsistenciaMarcacion[]): JornadaRow[] {
  const byDayUser = new Map<string, AsistenciaMarcacion[]>()
  for (const r of rows) {
    const key = `${r.usuario_id}|${dayKeyFromHora(r.hora)}`
    const list = byDayUser.get(key)
    if (list) list.push(r)
    else byDayUser.set(key, [r])
  }

  const out: JornadaRow[] = []
  for (const [groupKey, marks] of byDayUser) {
    const sorted = [...marks].sort((a, b) => msFromHora(a.hora) - msFromHora(b.hora))
    const [usuarioId, fecha] = groupKey.split('|')
    const name = sorted[0]?.usuario?.name ?? '—'
    const email = sorted[0]?.usuario?.email ?? ''

    let open: AsistenciaMarcacion | null = null
    let pairIdx = 0

    const pushPair = (entrada: AsistenciaMarcacion | null, salida: AsistenciaMarcacion | null) => {
      let duracionMs: number | null = null
      if (entrada && salida) {
        const d = msFromHora(salida.hora) - msFromHora(entrada.hora)
        duracionMs = d >= 0 ? d : null
      }
      out.push({
        key: `${groupKey}-${pairIdx++}`,
        fecha,
        usuarioId,
        usuarioName: entrada?.usuario?.name ?? salida?.usuario?.name ?? name,
        usuarioEmail: entrada?.usuario?.email ?? salida?.usuario?.email ?? email,
        entrada,
        salida,
        duracionMs,
      })
    }

    for (const m of sorted) {
      if (isEntradaTipo(m.tipo)) {
        if (open) pushPair(open, null)
        open = m
      } else if (isSalidaTipo(m.tipo)) {
        if (open) {
          pushPair(open, m)
          open = null
        } else {
          pushPair(null, m)
        }
      }
      // tipos desconocidos se omiten
    }
    if (open) pushPair(open, null)
  }

  return out.sort((a, b) => {
    const byFecha = b.fecha.localeCompare(a.fecha)
    if (byFecha) return byFecha
    const aH = a.entrada?.hora ?? a.salida?.hora ?? ''
    const bH = b.entrada?.hora ?? b.salida?.hora ?? ''
    return msFromHora(bH) - msFromHora(aH)
  })
}

export default function MarcacionesReporte() {
  const { profile } = useAuth()
  const allowed = canConfigureAsistencia(profile?.role)

  const today = useMemo(() => new Date(), [])
  const [desde, setDesde] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 14)
    return toDateInput(d)
  })
  const [hasta, setHasta] = useState(() => toDateInput(today))
  const [usuarioId, setUsuarioId] = useState('')
  const [rows, setRows] = useState<AsistenciaMarcacion[]>([])
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!allowed) return
    let alive = true
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, email, is_blocked')
        .or('is_blocked.eq.false,is_blocked.is.null')
        .order('name', { ascending: true })
        .limit(2000)
      if (!alive) return
      setUsers(
        (data ?? []).map((u: any) => ({
          id: String(u.id),
          name: String(u.name ?? u.email ?? '—'),
          email: String(u.email ?? ''),
        })),
      )
    })()
    return () => { alive = false }
  }, [allowed])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadMarcacionesReporte({
        desde,
        hasta,
        usuarioId: usuarioId || null,
        tipo: null,
      })
      setRows(data)
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo cargar el reporte.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [desde, hasta, usuarioId])

  useEffect(() => {
    if (allowed) void load()
  }, [allowed, load])

  if (!allowed) return <Navigate to="/perfil" replace />

  const userOptions = useMemo(
    () => users.map(u => ({ value: u.id, label: u.email ? `${u.name} (${u.email})` : u.name })),
    [users],
  )

  const jornadas = useMemo(() => agruparJornadas(rows), [rows])

  const resumen = useMemo(() => {
    const usuarios = new Set<string>()
    /** Horas acumuladas por usuario+fecha (máx. 1 día trabajado por persona/día). */
    const horasPorDiaUsuario = new Map<string, number>()
    let incompletos = 0

    for (const j of jornadas) {
      if (j.usuarioId) usuarios.add(j.usuarioId)
      const completo = !!(j.entrada && j.salida && j.duracionMs != null && j.duracionMs >= 0)
      if (completo) {
        const key = `${j.usuarioId}|${j.fecha}`
        horasPorDiaUsuario.set(
          key,
          (horasPorDiaUsuario.get(key) ?? 0) + j.duracionMs! / 3_600_000,
        )
      } else {
        incompletos += 1
      }
    }

    const diasTrabajados = horasPorDiaUsuario.size
    let horasTotales = 0
    for (const h of horasPorDiaUsuario.values()) horasTotales += h
    // Promedio Hrs/Día = suma de horas / días trabajados (usuario+fecha)
    const promedioHrsDia = diasTrabajados > 0 ? horasTotales / diasTrabajados : 0

    return {
      usuariosActivos: usuarios.size,
      diasTrabajados,
      promedioHrsDia,
      incompletos,
    }
  }, [jornadas])

  const exportExcel = () => {
    const data = jornadas.map(j => ({
      fecha: fmtDate(j.fecha),
      usuario: j.usuarioName,
      email: j.usuarioEmail,
      entrada: j.entrada ? fmtHoraOnly(j.entrada.hora) : '',
      salida: j.salida ? fmtHoraOnly(j.salida.hora) : '',
      duracion_h: j.duracionMs != null ? Number((j.duracionMs / 3_600_000).toFixed(2)) : null,
    }))
    exportRowsToExcel(
      data,
      [
        { key: 'fecha', label: 'Fecha' },
        { key: 'usuario', label: 'Usuario' },
        { key: 'email', label: 'Email' },
        { key: 'entrada', label: 'Entrada' },
        { key: 'salida', label: 'Salida' },
        { key: 'duracion_h', label: 'Duración (h)' },
      ],
      { sheetName: 'Marcaciones', filename: `marcaciones_${desde}_${hasta}` },
    )
  }

  const exportPdf = async () => {
    setExportingPdf(true)
    setError(null)
    try {
      const selected = users.find(u => u.id === usuarioId)
      await exportMarcacionesPdf({
        filters: {
          desde,
          hasta,
          usuarioLabel: selected
            ? (selected.email ? `${selected.name} (${selected.email})` : selected.name)
            : null,
        },
        resumen,
        jornadas: jornadas.map(j => ({
          fecha: j.fecha,
          usuarioName: j.usuarioName,
          usuarioEmail: j.usuarioEmail,
          entradaHora: fmtHoraOnly(j.entrada?.hora),
          salidaHora: fmtHoraOnly(j.salida?.hora),
          duracionLabel: fmtDuracionHoras(j.duracionMs),
        })),
      })
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo generar el PDF.')
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div className="fade-up space-y-4">
      <PageHeader
        title="Reporte de Marcaciones"
        subtitle="Entrada y salida del mismo día por usuario, con duración en horas."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </button>
            <button
              type="button"
              disabled={!jornadas.length}
              onClick={exportExcel}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Exportar Excel
            </button>
            <button
              type="button"
              disabled={!jornadas.length || exportingPdf}
              onClick={() => void exportPdf()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              {exportingPdf ? 'Generando PDF…' : 'Exportar PDF'}
            </button>
          </div>
        }
      />

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Filter className="h-4 w-4" />
          Filtros
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label text="Desde" />
            <TextInput type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div>
            <Label text="Hasta" />
            <TextInput type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          <div>
            <Label text="Usuario" />
            <SelectInput
              value={usuarioId}
              options={userOptions}
              onChange={e => setUsuarioId(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          tone="sky"
          icon={<Users className="h-5 w-5" />}
          label="Usuarios Activos"
          value={resumen.usuariosActivos}
        />
        <StatCard
          tone="green"
          icon={<CalendarDays className="h-5 w-5" />}
          label="Días Trabajados"
          value={resumen.diasTrabajados}
        />
        <StatCard
          tone="violet"
          icon={<Clock className="h-5 w-5" />}
          label="Promedio Hrs/Día"
          value={resumen.promedioHrsDia.toFixed(2)}
        />
        <StatCard
          tone="amber"
          icon={<AlertCircle className="h-5 w-5" />}
          label="Registros Incompletos"
          value={resumen.incompletos}
        />
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner label="Cargando marcaciones…" />
          </div>
        ) : jornadas.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No hay marcaciones para el rango seleccionado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Entrada</th>
                  <th className="px-4 py-3">Salida</th>
                  <th className="px-4 py-3 text-right">Duración</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jornadas.map(j => (
                  <tr key={j.key} className="hover:bg-slate-50/80">
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                      {fmtDate(j.fecha)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-800">{j.usuarioName}</div>
                      <div className="text-xs text-slate-400">{j.usuarioEmail}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-emerald-700">
                      {fmtHoraOnly(j.entrada?.hora)}
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-sky-700">
                      {fmtHoraOnly(j.salida?.hora)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-800">
                      {fmtDuracionHoras(j.duracionMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
