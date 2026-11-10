import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import ModuleTabs from '../components/ModuleTabs'
import {
  Bell, Camera, Copy, Dices, Eye, EyeOff, FileText, FolderKanban, Handshake, KeyRound, Mail, MapPin, Phone, Save,
  Shield, Trash2, User, ClipboardCheck, Banknote, Clock, StickyNote, Mailbox, ExternalLink,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Card, Modal, PageHeader } from '../components/ui'
import { Label, SelectInput, TextArea, TextInput } from '../components/fields'
import {
  AsistenciaGeocercaConfigPanel,
  AsistenciaMarcacionPanel,
} from '../components/AsistenciaPanel'
import MisActividadesPanel from '../components/MisActividadesPanel'
import {
  loadNotificationPrefs,
  NOTIF_MODULES,
  saveNotificationPrefs,
  type NotificationDuration,
  type NotificationStyle,
  type UserNotificationPrefs,
} from '../lib/userPreferences'
import { clearUserAvatar, resolveAvatarUrl, uploadUserAvatar } from '../lib/avatar'
import { generatePassword, PASSWORD_RULES_HINT, validatePassword } from '../lib/generatePassword'
import { canConfigureAsistencia } from '../lib/roles'

type TabId = 'general' | 'notificaciones' | 'asistencia' | 'actividades'

const TAB_IDS: TabId[] = ['general', 'notificaciones', 'asistencia', 'actividades']

function parseTab(value: string | null): TabId {
  if (value && (TAB_IDS as string[]).includes(value)) return value as TabId
  return 'general'
}

const MODULE_ICONS: Record<string, typeof FileText> = {
  expedientes: Mailbox,
  actas: FileText,
  memos: StickyNote,
  rendiciones: ClipboardCheck,
  proyectos: FolderKanban,
  strs: Banknote,
  convenios: Handshake,
  marcaciones: Clock,
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-brand-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function IconField({
  icon: Icon,
  children,
  disabled,
}: {
  icon: typeof User
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <div className={`relative ${disabled ? 'opacity-80' : ''}`}>
      <Icon className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
      <div className="[&_input]:pl-9 [&_textarea]:pl-9">{children}</div>
    </div>
  )
}

export default function Perfil() {
  const { profile, session, refreshProfile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = profile?.id ?? session?.user?.id ?? ''
  const tab = parseTab(searchParams.get('tab'))

  function setTab(next: TabId) {
    setSearchParams(next === 'general' ? {} : { tab: next }, { replace: false })
  }
  const [name, setName] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [notif, setNotif] = useState<UserNotificationPrefs | null>(null)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwd, setPwd] = useState({ next: '', confirm: '' })
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<string | null>(null)
  const [pwdVisible, setPwdVisible] = useState(false)
  const [pwdCopied, setPwdCopied] = useState(false)
  const [avatarBroken, setAvatarBroken] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!userId) return
    setName(profile?.name ?? '')
    setTelefono(profile?.phone ?? '')
    setDireccion(profile?.address ?? '')
    setAvatarBroken(false)
    setNotif(loadNotificationPrefs(userId))
  }, [userId, profile?.name, profile?.phone, profile?.address, profile?.avatar_url])

  const email = profile?.email ?? session?.user?.email ?? ''
  const role = (profile?.role ?? 'usuario').toUpperCase()
  const initial = (name || email || 'U').slice(0, 1).toUpperCase()
  const avatarSrc = resolveAvatarUrl(profile?.avatar_url, profile?.updated_at ?? profile?.avatar_url)

  async function onAvatarFile(file: File | undefined) {
    if (!file || !userId) return
    setAvatarBusy(true)
    setMsg(null)
    try {
      await uploadUserAvatar(userId, file, profile?.avatar_url)
      await refreshProfile()
      setAvatarBroken(false)
      setMsg({ type: 'ok', text: 'Foto de perfil actualizada.' })
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message ?? 'No se pudo subir el avatar.' })
    } finally {
      setAvatarBusy(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  async function onRemoveAvatar() {
    if (!userId) return
    setAvatarBusy(true)
    setMsg(null)
    try {
      await clearUserAvatar(userId, profile?.avatar_url)
      await refreshProfile()
      setAvatarBroken(false)
      setMsg({ type: 'ok', text: 'Foto de perfil eliminada.' })
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message ?? 'No se pudo quitar el avatar.' })
    } finally {
      setAvatarBusy(false)
    }
  }

  const estiloOptions = useMemo(
    () => [
      { value: 'toast', label: 'Notificación Flotante (Toast)' },
      { value: 'banner', label: 'Banner superior' },
      { value: 'none', label: 'Sin notificación visual' },
    ],
    [],
  )
  const duracionOptions = useMemo(
    () => [
      { value: 'short', label: 'Corta (3 Segundos)' },
      { value: 'normal', label: 'Normal (5 Segundos)' },
      { value: 'long', label: 'Larga (10 Segundos)' },
    ],
    [],
  )

  async function saveGeneral(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    setSaving(true)
    setMsg(null)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: name.trim() || null,
          phone: telefono.trim() || null,
          address: direccion.trim() || null,
        })
        .eq('id', userId)
      if (error) throw error
      await refreshProfile()
      setMsg({ type: 'ok', text: 'Cambios guardados correctamente.' })
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message ?? 'No se pudo guardar el perfil.' })
    } finally {
      setSaving(false)
    }
  }

  function persistNotif(next: UserNotificationPrefs) {
    setNotif(next)
    if (userId) saveNotificationPrefs(userId, next)
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwdMsg(null)
    const ruleErr = validatePassword(pwd.next)
    if (ruleErr) {
      setPwdMsg(ruleErr)
      return
    }
    if (pwd.next !== pwd.confirm) {
      setPwdMsg('Las contraseñas no coinciden.')
      return
    }
    setPwdSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd.next })
      if (error) throw error
      setPwd({ next: '', confirm: '' })
      setPwdOpen(false)
      setMsg({ type: 'ok', text: 'Contraseña actualizada correctamente.' })
    } catch (err: any) {
      setPwdMsg(err?.message ?? 'No se pudo cambiar la contraseña.')
    } finally {
      setPwdSaving(false)
    }
  }

  return (
    <div className="fade-up mx-auto max-w-6xl">
      <PageHeader
        title="Mi Perfil y Ajustes"
        subtitle="Gestiona tu información personal, foto de perfil, preferencias y tus actividades."
      />

      {msg && (
        <div
          className={`mb-4 rounded-xl border px-4 py-2.5 text-sm ${
            msg.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Sidebar */}
        <Card className="flex flex-col items-center p-6 text-center">
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-brand-600 text-3xl font-bold text-white shadow-md shadow-brand-600/25">
              {avatarSrc && !avatarBroken ? (
                <img
                  src={avatarSrc}
                  alt={name || 'Avatar'}
                  className="h-full w-full object-cover"
                  onError={() => setAvatarBroken(true)}
                />
              ) : (
                initial
              )}
            </div>
            <button
              type="button"
              title="Cambiar foto"
              disabled={avatarBusy || !userId}
              onClick={() => avatarInputRef.current?.click()}
              className="absolute -right-1 -bottom-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-md hover:bg-brand-700 disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={e => void onAvatarFile(e.target.files?.[0])}
            />
          </div>
          <h2 className="mt-4 text-lg font-bold text-brand-950">{name || 'Usuario'}</h2>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-slate-500">
            <Mail className="h-3.5 w-3.5" />
            {email || '—'}
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold tracking-wide text-slate-600 uppercase ring-1 ring-slate-200/80">
            <Shield className="h-3.5 w-3.5" />
            {role}
          </span>

          <div className="mt-3 flex w-full flex-col gap-2">
            <button
              type="button"
              disabled={avatarBusy || !userId}
              onClick={() => avatarInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              {avatarBusy ? 'Subiendo…' : 'Cambiar foto'}
            </button>
            {profile?.avatar_url && (
              <button
                type="button"
                disabled={avatarBusy}
                onClick={() => void onRemoveAvatar()}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Quitar foto
              </button>
            )}
          </div>

          <div className="my-5 h-px w-full bg-slate-100" />

          <button
            type="button"
            onClick={() => {
              setPwdMsg(null)
              setPwd({ next: '', confirm: '' })
              setPwdVisible(false)
              setPwdCopied(false)
              setPwdOpen(true)
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <KeyRound className="h-4 w-4" />
            Cambiar Contraseña
          </button>
        </Card>

        {/* Main */}
        <Card className="overflow-hidden">
          <div className="px-4 pt-2">
            <ModuleTabs
              tabs={[
                { id: 'general', label: 'Información general' },
                { id: 'notificaciones', label: 'Notificaciones y alertas' },
                { id: 'asistencia', label: 'Asistencia' },
                { id: 'actividades', label: 'Mis actividades' },
              ]}
              value={tab}
              onChange={setTab}
              ariaLabel="Secciones del perfil"
              className="mb-0"
            />
          </div>

          <div className="p-5">
            {tab === 'general' && (
              <form onSubmit={saveGeneral} className="space-y-5">
                <div>
                  <h3 className="text-base font-bold text-brand-950">Detalles Personales</h3>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Actualiza tu información de contacto y nombre para mostrar.
                  </p>
                </div>

                <div>
                  <Label text="Nombre Completo" />
                  <IconField icon={User}>
                    <TextInput value={name} onChange={e => setName(e.target.value)} required />
                  </IconField>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label text="Correo Electrónico (No editable)" />
                    <IconField icon={Mail} disabled>
                      <TextInput value={email} disabled />
                    </IconField>
                  </div>
                  <div>
                    <Label text="Teléfono" />
                    <IconField icon={Phone}>
                      <TextInput
                        value={telefono}
                        onChange={e => setTelefono(e.target.value)}
                        placeholder="+595…"
                      />
                    </IconField>
                  </div>
                </div>

                <div>
                  <Label text="Dirección Física" />
                  <IconField icon={MapPin}>
                    <TextArea
                      value={direccion}
                      onChange={e => setDireccion(e.target.value)}
                      placeholder="Ciudad, barrio…"
                      rows={3}
                    />
                  </IconField>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? 'Guardando…' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            )}

            {tab === 'notificaciones' && notif && (
              <div className="space-y-5">
                <Card className="p-4 shadow-none">
                  <div className="mb-4 flex items-start gap-3">
                    <div className="rounded-lg bg-brand-50 p-2 text-brand-600">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-brand-950">Preferencias de Notificación</h3>
                      <p className="text-sm text-slate-500">
                        Configura qué notificaciones deseas recibir en el sistema.
                      </p>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {(
                      [
                        {
                          key: 'derivacionExpedientes' as const,
                          title: 'Derivación de Expedientes',
                          desc: 'Recibir notificaciones cuando un expediente sea derivado a tu área.',
                        },
                        {
                          key: 'nuevasTareas' as const,
                          title: 'Nuevas Tareas',
                          desc: 'Recibir notificaciones cuando se te asigne una nueva tarea.',
                        },
                        {
                          key: 'avisosSistema' as const,
                          title: 'Avisos del Sistema',
                          desc: 'Notificaciones generales de la plataforma.',
                        },
                      ] as const
                    ).map(item => (
                      <div key={item.key} className="flex items-center justify-between gap-4 py-3.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                          <p className="text-xs text-slate-500">{item.desc}</p>
                        </div>
                        <Toggle
                          checked={notif[item.key]}
                          onChange={v => persistNotif({ ...notif, [item.key]: v })}
                        />
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-4 shadow-none">
                  <h3 className="text-base font-bold text-brand-950">Notificaciones en Tiempo Real</h3>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Configura las alertas automáticas cuando otros usuarios realizan cambios en los registros.
                  </p>

                  <div className="mt-5">
                    <p className="mb-2 text-xs font-bold tracking-wide text-slate-500 uppercase">
                      Ajustes Generales
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label text="Estilo de Notificación" />
                        <SelectInput
                          value={notif.estilo}
                          options={estiloOptions}
                          onChange={e =>
                            persistNotif({ ...notif, estilo: e.target.value as NotificationStyle })
                          }
                        />
                      </div>
                      <div>
                        <Label text="Duración en pantalla" />
                        <SelectInput
                          value={notif.duracion}
                          options={duracionOptions}
                          onChange={e =>
                            persistNotif({
                              ...notif,
                              duracion: e.target.value as NotificationDuration,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                      Módulos Activos
                    </p>
                    <p className="mt-1 mb-3 text-sm text-slate-500">
                      Selecciona los módulos de los cuales deseas recibir alertas cuando ocurran cambios.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {NOTIF_MODULES.map(mod => {
                        const Icon = MODULE_ICONS[mod.key] ?? FileText
                        const on = !!notif.modulos[mod.key]
                        return (
                          <div
                            key={mod.key}
                            className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                              <span className="truncate text-sm font-medium text-slate-700">{mod.label}</span>
                            </div>
                            <Toggle
                              checked={on}
                              onChange={v =>
                                persistNotif({
                                  ...notif,
                                  modulos: { ...notif.modulos, [mod.key]: v },
                                })
                              }
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {tab === 'asistencia' && userId && (
              <div>
                {canConfigureAsistencia(profile?.role) && (
                  <div className="mb-4 flex justify-end">
                    <Link
                      to="/marcaciones"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver reporte de marcaciones
                    </Link>
                  </div>
                )}
                <AsistenciaMarcacionPanel userId={userId} />
                {canConfigureAsistencia(profile?.role) && (
                  <AsistenciaGeocercaConfigPanel userId={userId} userRole={profile?.role} />
                )}
              </div>
            )}

            {tab === 'actividades' && userId && <MisActividadesPanel userId={userId} />}
          </div>
        </Card>
      </div>

      <Modal open={pwdOpen} onClose={() => setPwdOpen(false)} title="Cambiar Contraseña">
        <form onSubmit={changePassword} className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-sm text-slate-500">
              Ingresá una nueva contraseña para tu cuenta. {PASSWORD_RULES_HINT}
            </p>
            <button
              type="button"
              onClick={() => {
                const generated = generatePassword(12)
                setPwd({ next: generated, confirm: generated })
                setPwdVisible(true)
                setPwdMsg(null)
                setPwdCopied(false)
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
            >
              <Dices className="h-3.5 w-3.5" />
              Generar
            </button>
          </div>
          <div>
            <Label text="Nueva contraseña" required />
            <div className="relative">
              <TextInput
                type={pwdVisible ? 'text' : 'password'}
                autoComplete="new-password"
                value={pwd.next}
                onChange={e => setPwd(p => ({ ...p, next: e.target.value }))}
                required
                className="pr-20"
              />
              <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 gap-0.5">
                {pwd.next && (
                  <button
                    type="button"
                    title="Copiar"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(pwd.next)
                        setPwdCopied(true)
                        setTimeout(() => setPwdCopied(false), 1500)
                      } catch {
                        setPwdMsg('No se pudo copiar al portapapeles.')
                      }
                    }}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  title={pwdVisible ? 'Ocultar' : 'Mostrar'}
                  onClick={() => setPwdVisible(v => !v)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  {pwdVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {pwdCopied && <p className="mt-1 text-xs text-emerald-600">Contraseña copiada.</p>}
          </div>
          <div>
            <Label text="Confirmar contraseña" required />
            <TextInput
              type={pwdVisible ? 'text' : 'password'}
              autoComplete="new-password"
              value={pwd.confirm}
              onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))}
              required
            />
          </div>
          {pwdMsg && <p className="text-sm text-rose-600">{pwdMsg}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPwdOpen(false)}
              className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pwdSaving}
              className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {pwdSaving ? 'Guardando…' : 'Actualizar contraseña'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
