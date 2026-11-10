import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { fmtMoneyCompact } from '../lib/format'
import { cn } from '../lib/utils'

export interface ComponenteEjecucionRow {
  id: string
  codigo: string
  descripcion: string
  montoProyectos: number
  montoPagos: number
  montoRendiciones: number
}

type ChartMode = 'constelacion' | 'radar' | 'donut'

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 1000) / 10
}

function titleOf(row: ComponenteEjecucionRow): string {
  return [row.codigo, row.descripcion].filter(Boolean).join(' — ') || 'Sin componente'
}

function fmtPct(v: number): string {
  return `${v.toFixed(v % 1 === 0 ? 0 : 1)}%`
}

function polar(cx: number, cy: number, r: number, angleRad: number) {
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  }
}

/**
 * Constelación Soft Studio: cada componente es un nodo en órbita
 * con anillos de progreso (pagos / rendición) y rayos al núcleo.
 */
function ChartConstelacion({ rows }: { rows: ComponenteEjecucionRow[] }) {
  const data = useMemo(
    () =>
      rows.map(r => ({
        row: r,
        pagos: pct(r.montoPagos, r.montoProyectos),
        rend: pct(r.montoRendiciones, r.montoProyectos),
      })),
    [rows],
  )

  const n = Math.max(data.length, 1)
  const size = Math.min(520, 280 + n * 18)
  const cx = size / 2
  const cy = size / 2
  const orbitR = size * 0.32
  const nodeR = Math.max(28, Math.min(42, 120 / Math.sqrt(n)))

  return (
    <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center lg:gap-8">
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        {/* glow de fondo */}
        <div
          className="pointer-events-none absolute inset-[12%] rounded-full opacity-70"
          style={{
            background:
              'radial-gradient(circle, rgba(124,92,252,0.18) 0%, rgba(16,185,129,0.08) 45%, transparent 70%)',
          }}
        />
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative z-[1]">
          <defs>
            <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="55%" stopColor="#7c5cfc" />
              <stop offset="100%" stopColor="#5b3bc4" />
            </radialGradient>
            <filter id="softGlow">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#7c5cfc" floodOpacity="0.35" />
            </filter>
            <linearGradient id="rayGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7c5cfc" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#7c5cfc" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* órbitas guía */}
          {[0.55, 0.78, 1].map(k => (
            <circle
              key={k}
              cx={cx}
              cy={cy}
              r={orbitR * k + nodeR * 0.15}
              fill="none"
              stroke="#e2e8f0"
              strokeDasharray="2 6"
              strokeWidth={1}
            />
          ))}

          {/* rayos */}
          {data.map((d, i) => {
            const ang = -Math.PI / 2 + (i / n) * Math.PI * 2
            const tip = polar(cx, cy, orbitR - nodeR - 4, ang)
            return (
              <line
                key={`ray-${d.row.id}`}
                x1={cx}
                y1={cy}
                x2={tip.x}
                y2={tip.y}
                stroke="url(#rayGrad)"
                strokeWidth={1.5}
              />
            )
          })}

          {/* núcleo */}
          <circle cx={cx} cy={cy} r={34} fill="url(#coreGlow)" filter="url(#softGlow)" />
          <circle cx={cx} cy={cy} r={28} fill="#7c5cfc" />
          <text x={cx} y={cy - 4} textAnchor="middle" fill="#fff" fontSize={9} fontWeight={700}>
            Ejecución
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={8}>
            {n} comp.
          </text>

          {/* nodos */}
          {data.map((d, i) => {
            const ang = -Math.PI / 2 + (i / n) * Math.PI * 2
            const p = polar(cx, cy, orbitR, ang)
            const rTrack = nodeR - 2
            const rPagos = rTrack - 3
            const rRend = rTrack - 10
            const circ = 2 * Math.PI
            const pagosLen = (Math.min(100, d.pagos) / 100) * circ * rPagos
            const rendLen = (Math.min(100, d.rend) / 100) * circ * rRend
            const trackPagos = circ * rPagos
            const trackRend = circ * rRend

            return (
              <motion.g
                key={d.row.id}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.06, type: 'spring', stiffness: 220, damping: 18 }}
              >
                <circle cx={p.x} cy={p.y} r={nodeR + 3} fill="#fff" stroke="#e8eaf2" strokeWidth={1} />
                <circle cx={p.x} cy={p.y} r={rTrack} fill="#f8fafc" />

                {/* tracks */}
                <circle cx={p.x} cy={p.y} r={rPagos} fill="none" stroke="#d1fae5" strokeWidth={4} />
                <circle cx={p.x} cy={p.y} r={rRend} fill="none" stroke="#fef3c7" strokeWidth={3.5} />

                {/* progreso */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={rPagos}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray={`${pagosLen} ${trackPagos}`}
                  transform={`rotate(-90 ${p.x} ${p.y})`}
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={rRend}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeDasharray={`${rendLen} ${trackRend}`}
                  transform={`rotate(-90 ${p.x} ${p.y})`}
                />

                <text x={p.x} y={p.y - 3} textAnchor="middle" fill="#047857" fontSize={7} fontWeight={700}>
                  {fmtPct(d.pagos)}
                </text>
                <text x={p.x} y={p.y + 8} textAnchor="middle" fill="#b45309" fontSize={6.5} fontWeight={600}>
                  {fmtPct(d.rend)}
                </text>
                <title>
                  {titleOf(d.row)}
                  {'\n'}Pagos {fmtPct(d.pagos)} · Rendición {fmtPct(d.rend)}
                </title>
              </motion.g>
            )
          })}
        </svg>
      </div>

      <ul className="w-full max-w-md space-y-2.5 self-center lg:self-start lg:pt-4">
        {data.map((d, i) => (
          <motion.li
            key={d.row.id}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.04 }}
            className="flex items-start gap-2.5 rounded-xl border border-[#e8eaf2] bg-white/90 px-3 py-2 shadow-sm"
          >
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: `hsl(${(i * 47) % 360} 70% 55%)` }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold leading-snug text-slate-800">
                <span className="text-[#7c5cfc]">{d.row.codigo}</span>
                {d.row.descripcion ? ` — ${d.row.descripcion}` : ''}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Plan {fmtMoneyCompact(d.row.montoProyectos)}
                <span className="mx-1.5 text-emerald-600 font-semibold">· Pagos {fmtPct(d.pagos)}</span>
                <span className="text-amber-600 font-semibold">· Rend. {fmtPct(d.rend)}</span>
              </p>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

/** Radar dual: área de Pagos vs Rendiciones por componente. */
function ChartRadar({ rows }: { rows: ComponenteEjecucionRow[] }) {
  const data = useMemo(
    () =>
      rows.map(r => ({
        row: r,
        pagos: Math.min(100, pct(r.montoPagos, r.montoProyectos)),
        rend: Math.min(100, pct(r.montoRendiciones, r.montoProyectos)),
      })),
    [rows],
  )
  const n = Math.max(data.length, 3)
  const size = 380
  const cx = size / 2
  const cy = size / 2
  const maxR = 120

  const angles = data.map((_, i) => -Math.PI / 2 + (i / Math.max(data.length, 1)) * Math.PI * 2)

  const poly = (values: number[]) =>
    values
      .map((v, i) => {
        const p = polar(cx, cy, (v / 100) * maxR, angles[i] ?? 0)
        return `${p.x},${p.y}`
      })
      .join(' ')

  const pagosPts = poly(data.map(d => d.pagos))
  const rendPts = poly(data.map(d => d.rend))

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-3">
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} className="max-w-[420px]">
        <defs>
          <linearGradient id="radarPagos" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="radarRend" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#d97706" stopOpacity="0.18" />
          </linearGradient>
        </defs>

        {[25, 50, 75, 100].map(t => (
          <circle
            key={t}
            cx={cx}
            cy={cy}
            r={(t / 100) * maxR}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        ))}

        {angles.map((ang, i) => {
          const tip = polar(cx, cy, maxR, ang)
          return (
            <line
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={tip.x}
              y2={tip.y}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
          )
        })}

        {data.length >= 3 && (
          <>
            <polygon points={rendPts} fill="url(#radarRend)" stroke="#f59e0b" strokeWidth={1.5} />
            <polygon points={pagosPts} fill="url(#radarPagos)" stroke="#10b981" strokeWidth={1.5} />
          </>
        )}

        {data.map((d, i) => {
          const ang = angles[i]
          const labelR = maxR + 28
          const lp = polar(cx, cy, labelR, ang)
          const pp = polar(cx, cy, (d.pagos / 100) * maxR, ang)
          const rp = polar(cx, cy, (d.rend / 100) * maxR, ang)
          return (
            <g key={d.row.id}>
              <circle cx={pp.x} cy={pp.y} r={3.5} fill="#10b981" stroke="#fff" strokeWidth={1} />
              <circle cx={rp.x} cy={rp.y} r={3.5} fill="#f59e0b" stroke="#fff" strokeWidth={1} />
              <text
                x={lp.x}
                y={lp.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#334155"
                fontSize={8}
                fontWeight={700}
              >
                {d.row.codigo || '—'}
              </text>
              <text
                x={lp.x}
                y={lp.y + 11}
                textAnchor="middle"
                fill="#64748b"
                fontSize={6.5}
              >
                {fmtPct(d.pagos)} / {fmtPct(d.rend)}
              </text>
              <title>{titleOf(d.row)}</title>
            </g>
          )
        })}

        {data.length < 3 && (
          <text x={cx} y={cy} textAnchor="middle" fill="#94a3b8" fontSize={11}>
            Se necesitan al menos 3 componentes para el radar
          </text>
        )}
      </svg>

      <div className="grid w-full gap-2 sm:grid-cols-2">
        {data.map(d => (
          <div
            key={d.row.id}
            className="rounded-xl border border-[#e8eaf2] bg-white px-3 py-2 text-[11px]"
          >
            <p className="font-semibold text-slate-800 leading-snug">
              {d.row.codigo}{d.row.descripcion ? ` — ${d.row.descripcion}` : ''}
            </p>
            <p className="mt-0.5 text-slate-500">
              <span className="text-emerald-600 font-semibold">Pagos {fmtPct(d.pagos)}</span>
              {' · '}
              <span className="text-amber-600 font-semibold">Rend. {fmtPct(d.rend)}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChartDonut({ rows }: { rows: ComponenteEjecucionRow[] }) {
  const total = rows.reduce((s, r) => s + (r.montoProyectos || 0), 0)
  const palette = ['#7c5cfc', '#10b981', '#f59e0b', '#38bdf8', '#f43f5e', '#14b8a6', '#a78bfa', '#84cc16']
  const size = 168
  const cx = size / 2
  const cy = size / 2
  const rOut = 68
  const rIn = 40

  let angle = -Math.PI / 2
  const slices = rows.map((row, i) => {
    const value = row.montoProyectos || 0
    const portion = total > 0 ? value / total : 0
    const start = angle
    const sweep = portion * Math.PI * 2
    angle += sweep
    const end = angle
    const large = sweep > Math.PI ? 1 : 0
    const x0 = cx + rOut * Math.cos(start)
    const y0 = cy + rOut * Math.sin(start)
    const x1 = cx + rOut * Math.cos(end)
    const y1 = cy + rOut * Math.sin(end)
    const xi0 = cx + rIn * Math.cos(end)
    const yi0 = cy + rIn * Math.sin(end)
    const xi1 = cx + rIn * Math.cos(start)
    const yi1 = cy + rIn * Math.sin(start)
    const d =
      portion <= 0
        ? ''
        : [
            `M ${x0} ${y0}`,
            `A ${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1}`,
            `L ${xi0} ${yi0}`,
            `A ${rIn} ${rIn} 0 ${large} 0 ${xi1} ${yi1}`,
            'Z',
          ].join(' ')
    return { row, d, color: palette[i % palette.length], portion, value }
  })

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:justify-center sm:gap-8">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-md">
          <circle cx={cx} cy={cy + 3} r={rOut} fill="#e2e8f0" opacity={0.45} />
          {slices.map(s =>
            s.d ? (
              <path key={s.row.id} d={s.d} fill={s.color} stroke="#fff" strokeWidth={1.5}>
                <title>
                  {titleOf(s.row)}: {fmtMoneyCompact(s.value)} ({(s.portion * 100).toFixed(1)}%)
                </title>
              </path>
            ) : null,
          )}
          <circle cx={cx} cy={cy} r={rIn - 1} fill="#fff" />
          <text x={cx} y={cy - 4} textAnchor="middle" fill="#64748b" fontSize={10}>
            Plan vigente
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill="#1e293b" fontSize={12} fontWeight={700}>
            {fmtMoneyCompact(total)}
          </text>
        </svg>
      </div>
      <ul className="max-h-56 w-full max-w-sm space-y-2 overflow-y-auto pr-1">
        {slices.map(s => (
          <li key={s.row.id} className="flex items-start gap-2 text-sm">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm shadow-sm" style={{ background: s.color }} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800 leading-snug break-words">{titleOf(s.row)}</p>
              <p className="text-[11px] text-slate-500">
                {fmtMoneyCompact(s.value)} · {(s.portion * 100).toFixed(1)}%
                {' · '}
                Pagos {pct(s.row.montoPagos, s.row.montoProyectos)}%
                {' · '}
                Rend. {pct(s.row.montoRendiciones, s.row.montoProyectos)}%
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const MODES: { id: ChartMode; label: string }[] = [
  { id: 'constelacion', label: 'Constelación' },
  { id: 'radar', label: 'Radar' },
  { id: 'donut', label: 'Distribución' },
]

export default function EjecucionPorComponenteChart({ rows }: { rows: ComponenteEjecucionRow[] }) {
  const [mode, setMode] = useState<ChartMode>('constelacion')

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        No hay proyectos con componente para graficar.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm" /> Pagos STR
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-sm" /> Rendiciones
          </span>
        </div>
        <div className="inline-flex rounded-xl border border-[#e2e8f0] bg-slate-50 p-0.5">
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition',
                mode === m.id
                  ? 'bg-[#7c5cfc] text-white shadow-sm shadow-[#7c5cfc]/30'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#e2e8f0] bg-gradient-to-br from-[#f5f3ff]/80 via-white to-[#ecfdf5]/50 p-3 shadow-inner sm:p-5">
        {mode === 'constelacion' && <ChartConstelacion rows={rows} />}
        {mode === 'radar' && <ChartRadar rows={rows} />}
        {mode === 'donut' && <ChartDonut rows={rows} />}
      </div>
    </div>
  )
}
