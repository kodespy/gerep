import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Mail } from 'lucide-react'
import ConnectionStatusButton from '../components/ConnectionStatusButton'
import PasswordField from '../components/PasswordField'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError('Credenciales inválidas. Verifique su correo y contraseña.')
      return
    }
    const { registrarAuditoria } = await import('../lib/auditoria')
    await registrarAuditoria({
      accion: 'login',
      resumen: `Inicio de sesión: ${email.trim().toLowerCase()}`,
      meta: { email: email.trim().toLowerCase() },
    })
    navigate('/')
  }

  return (
    <div className="relative flex min-h-full flex-col bg-[#f3f5f8]">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ConnectionStatusButton />
      </div>
      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="fade-up w-full max-w-[26rem] overflow-hidden rounded-[1.6rem] border border-slate-200/80 bg-white shadow-studio">
          <div className="flex flex-col px-7 py-9 sm:px-9">
            <div className="mb-6 flex flex-col items-center">
              <div className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-slate-100 p-2.5">
                <img src="/app-icon.png?v=6" alt="" className="h-full w-full object-contain" />
              </div>
              <p className="text-lg font-bold tracking-tight text-ink">GEREP</p>
              <p className="text-sm text-slate-400">Gestión de Recursos Públicos</p>
            </div>

            <h1 className="mb-5 text-center text-xl font-semibold tracking-tight text-slate-900">
              Iniciar sesión
            </h1>

            <form onSubmit={submit} className="space-y-4">
              <div className="relative">
                <label htmlFor="login-email" className="sr-only">Correo electrónico (obligatorio)</label>
                <Mail className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="login-email"
                  type="email"
                  required
                  aria-required
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'login-error' : undefined}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Correo"
                  autoComplete="email"
                  className="w-full rounded-full border border-slate-200 bg-slate-50 py-3.5 pr-4 pl-11 text-sm text-slate-800 placeholder:text-slate-400 outline-none ring-0 focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-500/15"
                />
              </div>

              <PasswordField
                id="login-password"
                value={password}
                onChange={setPassword}
                describedBy={error ? 'login-error' : undefined}
              />

              {error && (
                <p id="login-error" role="alert" className="rounded-2xl bg-rose-50 px-4 py-2.5 text-center text-sm text-rose-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="gradient-primary mt-2 w-full rounded-full py-3.5 text-sm font-semibold tracking-wide text-white disabled:opacity-50"
              >
                {loading ? 'Ingresando…' : 'Ingresar'}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-slate-400">
              ¿Sin acceso? Solicite su cuenta al administrador del sistema.
            </p>
          </div>
        </div>
      </div>
      <footer className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 p-1">
            <img src="/app-icon.png?v=6" alt="" className="h-full w-full object-contain" />
          </span>
          <p className="text-[12px] font-semibold text-slate-600">GEREP</p>
        </div>
        <p className="text-[11px] text-slate-400">
          Desarrollado para <span className="font-semibold text-slate-600">UEP - SND</span>
        </p>
      </footer>
    </div>
  )
}
