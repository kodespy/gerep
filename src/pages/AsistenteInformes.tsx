import { useEffect, useRef, useState } from 'react'
import {
  Bot, Eraser, FileSpreadsheet, FileText, FileType, Loader2, Send, Sparkles, User,
} from 'lucide-react'
import { Badge, Card, PageHeader } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { ASISTENTE_EJEMPLOS, ASISTENTE_REPORTS, type AsistenteReportId } from '../lib/asistenteInformesCatalog'
import { generateAsistenteInforme } from '../lib/asistenteInformesGenerate'
import {
  intentFromChoice,
  resolveIntent,
  type AsistenteIntent,
  type IntentCandidate,
  type ResolveIntentResult,
} from '../lib/asistenteInformesIntent'
import { isAdminOrDev } from '../lib/roles'

type ChatMsg = {
  id: string
  role: 'user' | 'assistant'
  text: string
  intent?: AsistenteIntent | null
  choices?: {
    candidates: IntentCandidate[]
    partial: {
      formato: AsistenteIntent['formato']
      desde?: string | null
      hasta?: string | null
      anio?: number | null
      mes?: number | null
      situacion?: AsistenteIntent['situacion']
      q?: string | null
      where?: AsistenteIntent['where']
    }
  }
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const WELCOME_MSG: ChatMsg = {
  id: 'welcome',
  role: 'assistant',
  text:
    'Soy el asistente de informes. Pedí informe + formato + filtros (como un JOIN).\n' +
    'Ej.: “Radar CGR en Excel que la fecha de presentación esté Atrasada”.\n' +
    'También: finalizados, periodo, “solo presentadas”, etc.',
}

export default function AsistenteInformes() {
  const { profile } = useAuth()
  const isAdmin = isAdminOrDev(profile?.role)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([{ ...WELCOME_MSG, id: newId() }])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const hasLlm = Boolean((import.meta as any).env?.VITE_OPENAI_API_KEY)

  const clearChat = () => {
    if (busy) return
    setInput('')
    setMessages([{ ...WELCOME_MSG, id: newId() }])
  }

  const executeIntent = async (intent: AsistenteIntent) => {
    const result = await generateAsistenteInforme(intent, { isAdmin })
    setMessages(prev => [...prev, {
      id: newId(),
      role: 'assistant',
      text: `${intent.explanation}\n\n${result.message}`,
      intent,
    }])
  }

  const handleResolve = async (resolved: ResolveIntentResult) => {
    if (resolved.status === 'none') {
      setMessages(prev => [...prev, {
        id: newId(),
        role: 'assistant',
        text: resolved.explanation,
        intent: null,
      }])
      return
    }
    if (resolved.status === 'ambiguous') {
      setMessages(prev => [...prev, {
        id: newId(),
        role: 'assistant',
        text: resolved.explanation + '\n\nElegí una opción:',
        choices: { candidates: resolved.candidates, partial: resolved.partial },
      }])
      return
    }
    await executeIntent(resolved.intent)
  }

  const run = async (prompt: string) => {
    const text = prompt.trim()
    if (!text || busy) return
    setInput('')
    setMessages(prev => [...prev, { id: newId(), role: 'user', text }])
    setBusy(true)
    try {
      const resolved = await resolveIntent(text)
      await handleResolve(resolved)
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: newId(),
        role: 'assistant',
        text: e?.message ?? 'No se pudo generar el informe.',
      }])
    } finally {
      setBusy(false)
    }
  }

  const pickChoice = async (
    reportId: AsistenteReportId,
    partial: ChatMsg['choices'] extends infer C ? C extends { partial: infer P } ? P : never : never,
  ) => {
    if (busy || !partial) return
    setBusy(true)
    try {
      const intent = intentFromChoice(reportId, partial)
      if (!intent) throw new Error('Opción no válida.')
      setMessages(prev => [...prev, {
        id: newId(),
        role: 'user',
        text: `Elegí: ${intent.explanation.replace(/^Interpreté:\s*/i, '')}`,
      }])
      await executeIntent(intent)
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: newId(),
        role: 'assistant',
        text: e?.message ?? 'No se pudo generar el informe.',
      }])
    } finally {
      setBusy(false)
    }
  }

  const visibleReports = ASISTENTE_REPORTS.filter(r => !r.adminOnly || isAdmin)

  return (
    <div className="fade-up mx-auto max-w-5xl space-y-5">
      <PageHeader
        eyebrow="Informes"
        title="Asistente de informes"
        subtitle="Pedí un informe en lenguaje natural y descargalo en PDF, Excel o Word."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Card className="flex min-h-[28rem] flex-col overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white px-4 py-3 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900">
            <div className="rounded-lg bg-teal-600 p-1.5 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Chat de generación</p>
              <p className="text-[11px] text-slate-500">
                {hasLlm ? 'Motor: reglas + OpenAI' : 'Motor: reglas locales (opcional: VITE_OPENAI_API_KEY)'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={busy || messages.length <= 1}
                onClick={clearChat}
                title="Limpiar chat"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                <Eraser className="h-3.5 w-3.5" />
                Limpiar
              </button>
              <Badge color="green">PDF · Excel · Word</Badge>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map(m => (
              <div
                key={m.id}
                className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {m.text}
                  {m.choices && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      {m.choices.candidates.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={busy}
                          onClick={() => void pickChoice(c.id, m.choices!.partial)}
                          className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-left text-xs font-semibold text-teal-900 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-800 dark:bg-slate-900 dark:text-teal-200"
                        >
                          {c.label}
                          <span className="ml-2 font-normal text-slate-400">({c.kind})</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {m.intent && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-800 dark:bg-slate-900 dark:text-teal-300">
                        {m.intent.formato === 'excel' ? <FileSpreadsheet className="h-3 w-3" /> :
                          m.intent.formato === 'word' ? <FileType className="h-3 w-3" /> :
                            <FileText className="h-3 w-3" />}
                        {m.intent.formato}
                      </span>
                      <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        {m.intent.reportId}
                      </span>
                      {m.intent.situacion && (
                        <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          {m.intent.situacion}
                        </span>
                      )}
                      {(m.intent.where ?? []).map(w => (
                        <span key={w.label} className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                          {w.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {m.role === 'user' && (
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <User className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                Procesando…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-slate-100 p-3 dark:border-slate-800">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {ASISTENTE_EJEMPLOS.map(ex => (
                <button
                  key={ex}
                  type="button"
                  disabled={busy}
                  onClick={() => void run(ex)}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-teal-300 hover:text-teal-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900"
                >
                  {ex}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={e => {
                e.preventDefault()
                void run(input)
              }}
            >
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder='Ej. Expedientes finalizados en Excel desde 01/01/2026…'
                disabled={busy}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 dark:border-slate-600 dark:bg-slate-900"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Generar
              </button>
            </form>
          </div>
        </Card>

        <div className="space-y-3">
          <Card className="p-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Informes disponibles</h3>
            <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {visibleReports.map(r => (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(`${r.kind === 'informe' ? r.label : `Listado de ${r.label.replace(/^Listado de\s*/i, '')}`} en PDF`)}
                    className="w-full rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-left hover:border-teal-200 hover:bg-teal-50/50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/50"
                  >
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{r.label}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400 line-clamp-2">{r.description}</p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-teal-700">
                      {r.kind} · {r.formats.join(' · ')}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
