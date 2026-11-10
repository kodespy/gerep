import { cn } from '../lib/utils'

/** Texto largo recortado: title nativo + foco de teclado para leer el valor completo. */
export default function TruncatedText({
  text,
  className,
  lines = 2,
  as: Tag = 'span',
}: {
  text: string
  className?: string
  lines?: 1 | 2 | 3
  as?: 'span' | 'p' | 'h3'
}) {
  const clamp = lines === 1 ? 'truncate' : lines === 3 ? 'line-clamp-3' : 'line-clamp-2'
  return (
    <Tag
      tabIndex={0}
      title={text}
      className={cn(
        'min-w-0 outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring',
        clamp,
        className,
      )}
    >
      {text}
    </Tag>
  )
}
