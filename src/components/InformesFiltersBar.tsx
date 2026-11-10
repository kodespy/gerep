import { MESES } from '../lib/format'

export type InformesFilters = {
  actividadId: string
  programaId: string
  componenteId: string
  desde: string
  hasta: string
  mes: string
  anio: string
}

export const emptyInformesFilters = (): InformesFilters => {
  const now = new Date()
  return {
    actividadId: '',
    programaId: '',
    componenteId: '',
    desde: '',
    hasta: '',
    mes: String(now.getMonth() + 1),
    anio: String(now.getFullYear()),
  }
}

export type CascadeOption = { id: string; label: string }

export type InformesFiltersBarProps = {
  filters: InformesFilters
  onChange: (next: InformesFilters) => void
  /** `dashboard` muestra cascada + rango + mes/año (aplica a todos los informes del panel). */
  mode: 'range' | 'month' | 'year' | 'dashboard'
  actividadOpts: CascadeOption[]
  programaOpts: CascadeOption[]
  componenteOpts: CascadeOption[]
}

export default function InformesFiltersBar({
  filters,
  onChange,
  mode,
  actividadOpts,
  programaOpts,
  componenteOpts,
}: InformesFiltersBarProps) {
  const patch = (partial: Partial<InformesFilters>) => onChange({ ...filters, ...partial })

  const clear = () => {
    const base = emptyInformesFilters()
    onChange({
      ...base,
      mes: filters.mes,
      anio: filters.anio,
    })
  }

  const hasCascade = Boolean(filters.actividadId || filters.programaId || filters.componenteId)
  const hasDates = mode === 'range' || mode === 'dashboard'
    ? Boolean(filters.desde || filters.hasta)
    : mode === 'year'
      ? false
      : Boolean(filters.mes && filters.anio)

  const showRange = mode === 'range' || mode === 'dashboard'
  const showMonth = mode === 'month' || mode === 'dashboard'
  const showYearOnly = mode === 'year'
  const gridCols = mode === 'dashboard'
    ? 'grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7'
    : 'grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5'

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Filtros del observatorio</p>
        {(hasCascade || hasDates || (mode === 'dashboard' && (filters.mes || filters.anio))) && (
          <button
            type="button"
            onClick={clear}
            className="text-xs font-semibold text-brand-700 hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>
      <div className={`grid ${gridCols}`}>
        <label className="block text-xs font-semibold text-slate-600">
          Actividad
          <select
            value={filters.actividadId}
            onChange={e => patch({
              actividadId: e.target.value,
              programaId: '',
              componenteId: '',
            })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">Todas</option>
            {actividadOpts.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Programa
          <select
            value={filters.programaId}
            onChange={e => patch({
              programaId: e.target.value,
              componenteId: '',
            })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">Todos</option>
            {programaOpts.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Componente
          <select
            value={filters.componenteId}
            onChange={e => patch({ componenteId: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">Todos</option>
            {componenteOpts.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>

        {showRange && (
          <>
            <label className="block text-xs font-semibold text-slate-600">
              Fecha desde
              <input
                type="date"
                value={filters.desde}
                onChange={e => patch({ desde: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500"
              />
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Fecha hasta
              <input
                type="date"
                value={filters.hasta}
                onChange={e => patch({ hasta: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500"
              />
            </label>
          </>
        )}

        {showYearOnly && (
          <label className="block text-xs font-semibold text-slate-600">
            Año
            <input
              type="number"
              min={2000}
              max={2100}
              value={filters.anio}
              onChange={e => patch({ anio: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500"
            />
          </label>
        )}

        {showMonth && (
          <>
            <label className="block text-xs font-semibold text-slate-600">
              Mes
              <select
                value={filters.mes}
                onChange={e => patch({ mes: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500"
              >
                {MESES.map((m, i) => (
                  <option key={m} value={String(i + 1)}>{m}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Año
              <input
                type="number"
                min={2000}
                max={2100}
                value={filters.anio}
                onChange={e => patch({ anio: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand-500"
              />
            </label>
          </>
        )}
      </div>
    </div>
  )
}
