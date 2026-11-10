import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  LogIn,
  LogOut,
  MapPin,
  Monitor,
  Save,
} from 'lucide-react'
import { Label, TextInput } from './fields'
import { Card } from './ui'
import {
  loadGeocercaConfig,
  loadMarcacionesHoy,
  marcarAsistencia,
  saveGeocercaConfig,
  estadoDesdeMarcaciones,
  formatHoraLocal,
  type AsistenciaMarcacion,
  type GeocercaConfig,
  type MarcacionTipo,
} from '../lib/asistencia'
import { getOrCreateDeviceId } from '../lib/deviceId'
import { getCurrentPosition } from '../lib/geofence'
import { canConfigureAsistencia } from '../lib/roles'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatClock(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function formatDateEs(d: Date) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

function parseCoord(raw: string): number | null {
  const n = Number(String(raw).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Panel de marcación (reloj, dispositivo, entrada/salida). */
export function AsistenciaMarcacionPanel({ userId }: { userId: string }) {
  const [now, setNow] = useState(() => new Date())
  const [deviceId] = useState(() => getOrCreateDeviceId())
  const [config, setConfig] = useState<GeocercaConfig | null>(null)
  const [rows, setRows] = useState<AsistenciaMarcacion[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<MarcacionTipo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const [cfg, marks] = await Promise.all([
        loadGeocercaConfig(),
        loadMarcacionesHoy(userId),
      ])
      setConfig(cfg)
      setRows(marks)
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo cargar la asistencia.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const estado = useMemo(() => estadoDesdeMarcaciones(rows), [rows])
  const canEntrada = estado.key === 'sin_marcar' || estado.key === 'salida_marcada'
  const canSalida = estado.key === 'en_oficina'

  const onMarcar = async (tipo: MarcacionTipo) => {
    if (!userId) return
    setBusy(tipo)
    setError(null)
    setOkMsg(null)
    try {
      if (!config) {
        throw new Error('No hay geocerca configurada. Pedí a un administrador que la configure.')
      }
      await marcarAsistencia({ userId, tipo, config })
      setOkMsg(tipo === 'entrada' ? 'Entrada registrada correctamente.' : 'Salida registrada correctamente.')
      await reload()
    } catch (err: any) {
      if (err?.code === 'GEO_INVALID') {
        setError('Ubicación Inválida')
      } else {
        setError(err?.message ?? 'No se pudo registrar la marcación.')
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h3 className="mb-3 text-center text-lg font-bold text-slate-900">Control de Asistencia</h3>

      <div className="overflow-hidden rounded-2xl border border-slate-200 border-t-[3px] border-t-slate-900 bg-white shadow-sm">
        <div className="px-6 pt-8 pb-6 text-center">
          <div className="font-mono text-5xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-6xl">
            {formatClock(now)}
          </div>
          <p className="mt-2 text-sm text-slate-500">{formatDateEs(now)}</p>
          <p className="mt-4 text-sm text-slate-600">
            Estado Actual:{' '}
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200/80">
              {loading ? 'Cargando…' : estado.label}
            </span>
          </p>
        </div>

        <div className="px-5 pb-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <Monitor className="h-5 w-5 shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-semibold text-slate-800">Dispositivo Detectado</p>
              <p className="text-xs text-slate-500">
                Este identificador se asocia automáticamente a tu marcación.
              </p>
            </div>
            <div className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-semibold tracking-wide text-slate-700">
              {deviceId}
            </div>
          </div>
        </div>

        {(error || okMsg) && (
          <div className="px-5 pb-4">
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                <AlertCircle className="h-5 w-5 shrink-0" />
                {error}
              </div>
            )}
            {okMsg && !error && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                {okMsg}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 px-5 pb-6">
          <button
            type="button"
            disabled={!!busy || loading || !canEntrada}
            onClick={() => void onMarcar('entrada')}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#7da36a] px-4 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-[#6f955c] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <LogIn className="h-4 w-4" />
            {busy === 'entrada' ? 'Marcando…' : 'Marcar Entrada'}
          </button>
          <button
            type="button"
            disabled={!!busy || loading || !canSalida}
            onClick={() => void onMarcar('salida')}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#7b8fbf] px-4 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-[#6d81b1] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <LogOut className="h-4 w-4" />
            {busy === 'salida' ? 'Marcando…' : 'Marcar Salida'}
          </button>
        </div>

        {rows.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-4">
            <p className="mb-2 text-xs font-bold tracking-wide text-slate-400 uppercase">Hoy</p>
            <ul className="space-y-1.5">
              {rows.map(r => (
                <li key={r.id} className="flex items-center justify-between text-sm text-slate-600">
                  <span className="font-medium capitalize">{r.tipo}</span>
                  <span className="font-mono tabular-nums text-slate-500">
                    {formatHoraLocal(r.hora)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

/** Configuración de sede / geocerca (admin y desarrollador). */
export function AsistenciaGeocercaConfigPanel({
  userId,
  userRole,
}: {
  userId: string
  userRole: string | null | undefined
}) {
  const allowed = canConfigureAsistencia(userRole)
  const [id, setId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [radio, setRadio] = useState('60')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    if (!allowed) {
      setLoading(false)
      return
    }
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const cfg = await loadGeocercaConfig()
        if (!alive) return
        if (cfg) {
          setId(cfg.id)
          setNombre(cfg.nombre_sede)
          setLat(String(cfg.latitud))
          setLng(String(cfg.longitud))
          setRadio(String(cfg.radio_metros))
        }
      } catch (err: any) {
        if (alive) setMsg({ type: 'err', text: err?.message ?? 'No se pudo cargar la configuración.' })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [allowed])

  if (!allowed) return null

  const onLocate = async () => {
    setLocating(true)
    setMsg(null)
    try {
      const pos = await getCurrentPosition()
      setLat(String(pos.coords.latitude))
      setLng(String(pos.coords.longitude))
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message ?? 'No se pudo obtener la ubicación.' })
    } finally {
      setLocating(false)
    }
  }

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    const latN = parseCoord(lat)
    const lngN = parseCoord(lng)
    const radioN = parseCoord(radio)
    if (!nombre.trim()) {
      setMsg({ type: 'err', text: 'Ingresá el nombre de la sede.' })
      return
    }
    if (latN == null || lngN == null) {
      setMsg({ type: 'err', text: 'Latitud y longitud deben ser números válidos.' })
      return
    }
    if (radioN == null || radioN <= 0) {
      setMsg({ type: 'err', text: 'El radio debe ser mayor a 0.' })
      return
    }
    setSaving(true)
    try {
      const saved = await saveGeocercaConfig({
        id,
        nombre_sede: nombre,
        latitud: latN,
        longitud: lngN,
        radio_metros: radioN,
        updated_by: userId,
      })
      setId(saved.id)
      setMsg({ type: 'ok', text: 'Configuración actualizada.' })
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message ?? 'No se pudo guardar.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mt-8 overflow-hidden p-0 shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-slate-700" />
          <h3 className="text-base font-bold text-slate-900">Configuración de Sede Principal</h3>
        </div>
      </div>

      <form onSubmit={onSave} className="space-y-5 p-5">
        <div>
          <h4 className="text-sm font-bold text-slate-800">Parámetros de Geocerca</h4>
          <p className="mt-1 text-sm text-slate-500">
            Define la ubicación central exacta y el radio permitido en metros para las marcaciones de
            asistencia válidas de los usuarios.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Cargando configuración…</p>
        ) : (
          <>
            <div>
              <Label text="Nombre de Sede/Oficina" required />
              <TextInput
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Sede Central…"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label text="Latitud" required />
                <TextInput
                  value={lat}
                  onChange={e => setLat(e.target.value)}
                  inputMode="decimal"
                  required
                />
              </div>
              <div>
                <Label text="Longitud" required />
                <TextInput
                  value={lng}
                  onChange={e => setLng(e.target.value)}
                  inputMode="decimal"
                  required
                />
              </div>
            </div>

            <button
              type="button"
              disabled={locating}
              onClick={() => void onLocate()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <MapPin className="h-4 w-4" />
              {locating ? 'Obteniendo ubicación…' : 'Obtener Coordenadas de Mi Ubicación Actual'}
            </button>

            <div>
              <Label text="Radio de Tolerancia (en metros)" required />
              <TextInput
                value={radio}
                onChange={e => setRadio(e.target.value)}
                inputMode="numeric"
                required
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Distancia máxima permitida en línea recta desde el punto central para que el sistema
                acepte el registro de asistencia.
              </p>
            </div>

            {msg && (
              <p
                className={`text-sm ${msg.type === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}
              >
                {msg.text}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Guardando…' : 'Actualizar Configuración'}
            </button>
          </>
        )}
      </form>
    </Card>
  )
}
