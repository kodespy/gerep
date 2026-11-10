export function CodigoDescripcionCell({ codigo, descripcion }: { codigo?: string | null; descripcion?: string | null }) {
  return (
    <div className="min-w-[100px] max-w-[200px]">
      <span className="font-medium text-slate-800">{codigo ?? '—'}</span>
      {descripcion && <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-400">{descripcion}</p>}
    </div>
  )
}
