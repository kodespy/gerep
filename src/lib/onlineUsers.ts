import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { UserProfile } from '../context/AuthContext'
import { resolveAvatarUrl } from './avatar'

/** Canal propio de esta app (no compartir con mistock u otros). */
export const ONLINE_CHANNEL = 'online-users-proyectos'
export const ONLINE_TOPIC = `realtime:${ONLINE_CHANNEL}`

export type OnlineUser = {
  id: string
  name: string | null
  email: string | null
  role: string | null
  avatar_url: string | null
  online_at?: string
  isSelf?: boolean
}

type PresenceListener = () => void

const listeners = new Set<PresenceListener>()
let sharedChannel: RealtimeChannel | null = null
let sharedUserId: string | null = null
let refCount = 0
/** Serializa alta/baja para no llamar `.on('presence')` tras `subscribe()`. */
let opChain: Promise<void> = Promise.resolve()

function notifyListeners() {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      // ignore
    }
  }
}

export function getOnlineUsersChannel(): RealtimeChannel | null {
  return sharedChannel
}

export function trackPayloadFromProfile(profile: UserProfile) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    avatar_url: resolveAvatarUrl(profile.avatar_url, profile.updated_at ?? profile.avatar_url),
    online_at: new Date().toISOString(),
  }
}

async function trackSafe(channel: RealtimeChannel, payload: ReturnType<typeof trackPayloadFromProfile>) {
  try {
    await channel.track(payload)
    notifyListeners()
  } catch {
    // ignore transient realtime errors
  }
}

async function disposeChannel(channel: RealtimeChannel | null) {
  if (!channel) return
  try {
    await channel.untrack()
  } catch {
    // ignore
  }
  try {
    await supabase.removeChannel(channel)
  } catch {
    // ignore
  }
}

function isLiveChannel(channel: RealtimeChannel | null | undefined): channel is RealtimeChannel {
  if (!channel) return false
  return channel.state === 'joined' || channel.state === 'joining'
}

function findTopicChannel(): RealtimeChannel | undefined {
  return supabase.getChannels().find(c => c.topic === ONLINE_TOPIC)
}

function getLiveChannel(): RealtimeChannel | null {
  if (isLiveChannel(sharedChannel)) return sharedChannel
  const existing = findTopicChannel()
  return isLiveChannel(existing) ? existing : null
}

function enqueue(op: () => Promise<void>) {
  opChain = opChain.then(op).catch(() => {})
}

function bindPresenceIfNeeded(channel: RealtimeChannel) {
  if (isLiveChannel(channel)) return
  try {
    channel
      .on('presence', { event: 'sync' }, () => notifyListeners())
      .on('presence', { event: 'join' }, () => notifyListeners())
      .on('presence', { event: 'leave' }, () => notifyListeners())
  } catch {
    // Canal ya suscripto / reutilizado por supabase-js: no volver a registrar.
  }
}

async function startPresenceChannel(profile: UserProfile) {
  if (refCount <= 0) return

  const live = getLiveChannel()
  if (live) {
    sharedChannel = live
    sharedUserId = profile.id
    if (live.state === 'joined') {
      await trackSafe(live, trackPayloadFromProfile(profile))
    }
    return
  }

  const leftover = supabase.getChannels().filter(c => c.topic === ONLINE_TOPIC && !isLiveChannel(c))
  await Promise.all(leftover.map(ch => disposeChannel(ch)))

  if (refCount <= 0) return

  const stillLive = getLiveChannel()
  if (stillLive) {
    sharedChannel = stillLive
    sharedUserId = profile.id
    if (stillLive.state === 'joined') {
      await trackSafe(stillLive, trackPayloadFromProfile(profile))
    }
    return
  }

  const channel = supabase.channel(ONLINE_CHANNEL, {
    config: { presence: { key: profile.id } },
  })

  // supabase-js reutiliza el canal del mismo topic: si ya está joining/joined, no llamar .on()
  if (isLiveChannel(channel)) {
    sharedChannel = channel
    sharedUserId = profile.id
    if (channel.state === 'joined') {
      await trackSafe(channel, trackPayloadFromProfile(profile))
    }
    return
  }

  bindPresenceIfNeeded(channel)
  sharedChannel = channel
  sharedUserId = profile.id

  await new Promise<void>(resolve => {
    channel.subscribe(async status => {
      if (status === 'SUBSCRIBED' && sharedChannel === channel && refCount > 0) {
        await trackSafe(channel, trackPayloadFromProfile(profile))
      }
      resolve()
    })
  })
}

/**
 * Une el canal de presencia (singleton).
 * Los callbacks `presence` se registran solo ANTES de `subscribe()`.
 */
export function ensureOnlinePresence(profile: UserProfile): () => void {
  const payload = trackPayloadFromProfile(profile)
  refCount += 1

  const live = getLiveChannel()
  if (live && (sharedUserId === profile.id || sharedUserId == null)) {
    sharedChannel = live
    sharedUserId = profile.id
    if (live.state === 'joined') {
      void trackSafe(live, payload)
    }
  } else {
    enqueue(() => startPresenceChannel(profile))
  }

  return () => {
    refCount = Math.max(0, refCount - 1)
    if (refCount > 0) return
    enqueue(async () => {
      if (refCount > 0) return
      const ch = sharedChannel
      sharedChannel = null
      sharedUserId = null
      await disposeChannel(ch)
      notifyListeners()
    })
  }
}

/** Suscripción a cambios de presencia (además del polling de respaldo). */
export function subscribeOnlineUsers(listener: PresenceListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function readOnlineUsers(self: UserProfile | null): OnlineUser[] {
  if (!self?.id) return []

  const channel = getOnlineUsersChannel()
  const presenceState = (channel as any)?.presenceState?.() ?? {}

  const fromPresence = (Object.keys(presenceState) as string[])
    .flatMap(key => {
      const metas = presenceState[key]
      return Array.isArray(metas) ? metas : []
    })
    .filter((u): u is OnlineUser => !!u?.id)
    .map(u => ({
      id: String(u.id),
      name: u.name ?? null,
      email: u.email ?? null,
      role: u.role ?? null,
      avatar_url: u.avatar_url ?? null,
      online_at: u.online_at,
      isSelf: false,
    }))

  const byId = new Map<string, OnlineUser>()
  for (const u of fromPresence) {
    const prev = byId.get(u.id)
    if (!prev || String(u.online_at ?? '') > String(prev.online_at ?? '')) {
      byId.set(u.id, u)
    }
  }

  const selfUser: OnlineUser = {
    id: self.id,
    name: self.name,
    email: self.email,
    role: self.role,
    avatar_url: resolveAvatarUrl(self.avatar_url, self.updated_at ?? self.avatar_url),
    isSelf: true,
  }

  const others = [...byId.values()].filter(u => u.id !== self.id)
  const selfFromPresence = byId.get(self.id)
  const selfEntry: OnlineUser = selfFromPresence
    ? {
        ...selfFromPresence,
        isSelf: true,
        name: selfFromPresence.name || self.name,
        avatar_url: selfFromPresence.avatar_url || selfUser.avatar_url,
      }
    : selfUser

  return [selfEntry, ...others].sort((a, b) => {
    if (a.isSelf && !b.isSelf) return -1
    if (!a.isSelf && b.isSelf) return 1
    return (a.name || a.email || '').localeCompare(b.name || b.email || '', 'es')
  })
}
