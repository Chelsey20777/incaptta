import type { ClassValue } from "clsx"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: any) {
  if (!date) return ''
  try {
    const d = (date && typeof date.toDate === 'function') ? date.toDate() : new Date(date)
    if (isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  } catch (e) {
    return ''
  }
}

export function isValidDate(date: any): boolean {
  if (!date) return false
  const d = new Date(date)
  return !isNaN(d.getTime())
}
