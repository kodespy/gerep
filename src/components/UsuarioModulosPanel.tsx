import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { APP_MODULOS, MODULO_ROL_OPTIONS, modulosPorSeccion, type ModuloRol } from '../lib/appModulos'
import { loadUsuarioModulos, saveUsuarioModulos } from '../lib/usuarioModulos'

type RowState = { enabled: boolean; rol: ModuloRol }

export default function UsuarioModulosPanel({
  userId,
  userName,
}: {
  userId: string
  userName?: string
}) {
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const sections = useMemo(
    () => modulosPorSeccion()
      .filter(s => s.section !== 'RRHH' && s.section !== 'Sistema')
      .map(s => ({
        ...s,
        // Perfil y Documentaciones son públicos para todos los roles
        items: s.items.filter(m => m.key !== 'perfil' && m.key !== 'documentaciones'),
      }))
      .filter(s => s.items.length > 0),
    [],
  )

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setMsg(null)
      try {
        const assigned = await loadUsuarioModulos(userId)
        if (!alive) return
        const map: Record<string, RowState> = {}
        for (const m of APP_MODULOS) {
          if (m.section === 'RRHH' || m.section === 'Sistema') continue
          if (m.key === 'perfil' || m.key === 'documentaciones') continue
          const hit = assigned.find(a => a.modulo === m.key)
          map[m.key] = {
            enabled: !!hit,
            rol: hit?.rol ?? 'usuario',
          }
        }
        setRows(map)
      } catch (err: any) {
        if (alive) setMsg({ type: 'err', text: err?.message ?? 'No se pudieron cargar los módulos.' })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [userId])

  const setEnabled = (key: string, enabled: boolean) => {
    setRows(prev => ({
      ...prev,
      [key]: { ...(prev[key] ?? { rol: 'usuario' as ModuloRol }), enabled },
    }))
  }

  const setRol = (key: string, rol: ModuloRol) => {
    setRows(prev => ({
      ...prev,
      [key]: { ...(prev[key] ?? { enabled: true }), enabled: prev[key]?.enabled ?? true, rol },
    }))
  }

  const save = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const items = Object.entries(rows)
        .filter(([, v]) => v.enabled)
        .map(([modulo, v]) => ({ modulo, rol: v.rol }))
      await saveUsuarioModulos(userId, items)
      setMsg({ type: 'ok', text: 'Módulos actualizados.' })
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message ?? 'No se pudo guardar.' })
    } finally {
      setSaving(false)
    }
  }

  const enabledCount = Object.values(rows).filter(r => r.enabled).length

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-slate-800">
            Módulos y roles{userName ? ` · ${userName}` : ''}
          </h4>
          <p className="text-xs text-slate-500">
            Activá los módulos a los que puede acceder y asigná el rol en cada uno.
            {loading ? '' : ` (${enabledCount} activos)`}
          </p>
        </div>
        <button
          type="button"
          disabled={loading || saving}
          onClick={() => void save()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar módulos
        </button>
      </div>

      {msg && (
        <p className={`mb-3 text-sm ${msg.type === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>
          {msg.text}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando módulos…
        </p>
      ) : (
        <div className="space-y-4">
          {sections.map(sec => (
            <div key={sec.section}>
              <p className="mb-2 text-[11px] font-bold tracking-wide text-slate-400 uppercase">
                {sec.section}
              </p>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                {sec.items.map(m => {
                  const st = rows[m.key] ?? { enabled: false, rol: 'usuario' as ModuloRol }
                  return (
                    <div
                      key={m.key}
                      className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap"
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={st.enabled}
                          onChange={e => setEnabled(m.key, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="truncate text-sm font-medium text-slate-800">{m.label}</span>
                      </label>
                      <select
                        value={st.rol}
                        disabled={!st.enabled}
                        onChange={e => setRol(m.key, e.target.value as ModuloRol)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 sm:w-44"
                      >
                        {MODULO_ROL_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
