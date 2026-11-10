/** Contraseña aleatoria legible (sin caracteres ambiguos: 0/O, 1/l/I). */
export function generatePassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%&*?'
  const all = upper + lower + digits + symbols

  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)]!
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  while (chars.length < Math.max(8, length)) chars.push(pick(all))

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[chars[i], chars[j]] = [chars[j]!, chars[i]!]
  }
  return chars.join('')
}

export const PASSWORD_RULES_HINT =
  'Mínimo 6 caracteres, con al menos 1 mayúscula, 1 minúscula y 1 carácter especial.'

/** Valida reglas de contraseña. Devuelve null si es válida, o el mensaje de error. */
export function validatePassword(password: string): string | null {
  const p = password ?? ''
  if (p.length < 6) return 'La contraseña debe tener al menos 6 caracteres.'
  if (!/[A-ZÁÉÍÓÚÑ]/.test(p)) return 'La contraseña debe incluir al menos una letra mayúscula.'
  if (!/[a-záéíóúñ]/.test(p)) return 'La contraseña debe incluir al menos una letra minúscula.'
  if (!/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/.test(p)) {
    return 'La contraseña debe incluir al menos un carácter especial (ej. ! @ # $ %).'
  }
  return null
}
