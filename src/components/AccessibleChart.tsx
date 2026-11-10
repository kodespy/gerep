import type { ReactNode } from 'react'

export type ChartTableColumn = { key: string; label: string; numeric?: boolean }

/** Gráfico con pie de unidad/período y tabla accesible equivalente. */
export default function AccessibleChart({
  title,
  caption,
  unit,
  period,
  reference,
  children,
  columns,
  rows,
}: {
  title: string
  caption?: string
  unit?: string
  period?: string
  reference?: string
  children: ReactNode
  columns: ChartTableColumn[]
  rows: Array<Record<string, string | number>>
}) {
  const meta = [unit && `Unidad: ${unit}`, period && `Período: ${period}`, reference && `Referencia: ${reference}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <figure className="space-y-3">
      <figcaption className="space-y-0.5">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        {caption && <p className="text-xs text-slate-600 dark:text-slate-400">{caption}</p>}
        {meta && <p className="text-[11px] text-slate-600 dark:text-slate-400">{meta}</p>}
      </figcaption>
      {children}
      {rows.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Ver datos en tabla
          </summary>
          <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
            <table className="w-full min-w-[20rem] text-left text-xs">
              <caption className="sr-only">{title}{meta ? `. ${meta}` : ''}</caption>
              <thead>
                <tr className="bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {columns.map(c => (
                    <th key={c.key} scope="col" className={`px-3 py-2 font-semibold ${c.numeric ? 'text-right' : ''}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    {columns.map(c => (
                      <td
                        key={c.key}
                        className={`px-3 py-1.5 text-slate-800 dark:text-slate-200 ${c.numeric ? 'text-right tabular-nums' : ''}`}
                      >
                        {row[c.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  )
}
