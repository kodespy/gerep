import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Combina classNames con resolución de conflictos Tailwind (clsx + tailwind-merge). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
