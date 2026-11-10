import { useId, useState } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'

export default function PasswordField({
  value,
  onChange,
  label = 'Contraseña',
  autoComplete = 'current-password',
  required = true,
  describedBy,
  error,
  help,
  placeholder = 'Contraseña',
  id,
}: {
  value: string
  onChange: (value: string) => void
  label?: string
  autoComplete?: string
  required?: boolean
  describedBy?: string
  error?: string | null
  help?: string
  placeholder?: string
  id?: string
}) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const helpId = `${fieldId}-help`
  const errorId = `${fieldId}-error`
  const [visible, setVisible] = useState(false)
  const described = [
    help ? helpId : null,
    error ? errorId : null,
    describedBy ?? null,
  ].filter(Boolean).join(' ') || undefined

  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="sr-only">
        {label}{required ? ' (obligatorio)' : ''}
      </label>
      <div className="relative">
        <Lock className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
        <input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          required={required}
          aria-required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full rounded-full border border-slate-200 bg-slate-50 py-3.5 pr-12 pl-11 text-sm text-slate-800 placeholder:text-slate-400 outline-none ring-0 focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-500/15"
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute top-1/2 right-3 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-600 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {help && (
        <p id={helpId} className="px-2 text-xs text-slate-600">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="px-2 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  )
}
