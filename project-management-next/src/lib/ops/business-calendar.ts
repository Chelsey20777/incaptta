export interface BusinessCalendar {
  timezone?: string
  weekdays?: number[]
  openHour?: number
  closeHour?: number
  holidays?: string[]
  firstResponseHours?: number
  reminderMinutes?: number
  escalationHours?: number
}

export const DEFAULT_BUSINESS_CALENDAR: Required<Omit<BusinessCalendar, 'timezone' | 'holidays'>> & {
  timezone: string
  holidays: string[]
} = {
  timezone: 'Africa/Harare',
  weekdays: [1, 2, 3, 4, 5],
  openHour: 8,
  closeHour: 17,
  holidays: [],
  firstResponseHours: 2,
  reminderMinutes: 30,
  escalationHours: 4,
}

export function resolveCalendar(settings?: BusinessCalendar | null): typeof DEFAULT_BUSINESS_CALENDAR {
  return {
    ...DEFAULT_BUSINESS_CALENDAR,
    ...settings,
    weekdays: settings?.weekdays?.length ? settings.weekdays : DEFAULT_BUSINESS_CALENDAR.weekdays,
    holidays: settings?.holidays || [],
  }
}

function isHoliday(date: Date, holidays: string[]) {
  const key = date.toISOString().slice(0, 10)
  return holidays.includes(key)
}

export function isWorkingDate(date: Date, calendar = DEFAULT_BUSINESS_CALENDAR) {
  return calendar.weekdays.includes(date.getDay()) && !isHoliday(date, calendar.holidays)
}

export function nextOpen(from: Date, calendar = DEFAULT_BUSINESS_CALENDAR) {
  const date = new Date(from)
  if (!isWorkingDate(date, calendar) || date.getHours() >= calendar.closeHour) {
    date.setDate(date.getDate() + 1)
    date.setHours(calendar.openHour, 0, 0, 0)
    while (!isWorkingDate(date, calendar)) date.setDate(date.getDate() + 1)
    return date
  }
  if (date.getHours() < calendar.openHour) {
    date.setHours(calendar.openHour, 0, 0, 0)
  }
  return date
}

export function addWorkingHours(from: Date, hours: number, calendar = DEFAULT_BUSINESS_CALENDAR) {
  let remaining = hours * 60
  const date = nextOpen(from, calendar)
  const windowMinutes = (calendar.closeHour - calendar.openHour) * 60
  while (remaining > 0) {
    const minutesLeftToday = calendar.closeHour * 60 - (date.getHours() * 60 + date.getMinutes())
    const step = Math.min(remaining, minutesLeftToday)
    date.setMinutes(date.getMinutes() + step)
    remaining -= step
    if (remaining > 0) {
      date.setDate(date.getDate() + 1)
      date.setHours(calendar.openHour, 0, 0, 0)
      while (!isWorkingDate(date, calendar)) date.setDate(date.getDate() + 1)
    }
    if (windowMinutes <= 0) break
  }
  return date
}

export function firstResponseDue(receivedAt: string | Date, capturedAt: string | Date, calendar?: BusinessCalendar) {
  const resolved = resolveCalendar(calendar)
  const received = nextOpen(new Date(receivedAt), resolved)
  const due = addWorkingHours(received, resolved.firstResponseHours, resolved)
  return {
    dueAt: due.toISOString(),
    lateCapture: new Date(capturedAt).getTime() > new Date(receivedAt).getTime() + 60 * 60 * 1000,
  }
}

export function reminderAt(dueAt: string | Date, calendar?: BusinessCalendar) {
  const resolved = resolveCalendar(calendar)
  return new Date(new Date(dueAt).getTime() - resolved.reminderMinutes * 60 * 1000).toISOString()
}

export function escalationDue(overdueFrom: string | Date, calendar?: BusinessCalendar) {
  const resolved = resolveCalendar(calendar)
  return addWorkingHours(new Date(overdueFrom), resolved.escalationHours, resolved).toISOString()
}

export function enquiryTimerState(input: {
  receivedAt?: string
  capturedAt?: string
  nextActionDueAt?: string
  firstRespondedAt?: string
  now?: Date
  calendar?: BusinessCalendar
}) {
  const now = input.now || new Date()
  const calendar = resolveCalendar(input.calendar)
  const receivedAt = input.receivedAt || input.capturedAt || now.toISOString()
  const capturedAt = input.capturedAt || receivedAt
  const first = firstResponseDue(receivedAt, capturedAt, calendar)
  const nextDue = input.nextActionDueAt ? new Date(input.nextActionDueAt) : null
  const overdue = Boolean(nextDue && nextDue.getTime() < now.getTime())
  return {
    firstResponseDueAt: first.dueAt,
    lateCapture: first.lateCapture,
    firstResponseOpen: !input.firstRespondedAt && now.getTime() > Date.parse(first.dueAt),
    reminderAt: nextDue ? reminderAt(nextDue, calendar) : null,
    reminderDue: Boolean(nextDue && now.getTime() >= Date.parse(reminderAt(nextDue, calendar)) && now.getTime() < nextDue.getTime()),
    overdue,
    escalationDueAt: overdue && nextDue ? escalationDue(nextDue, calendar) : null,
    escalate: Boolean(overdue && nextDue && now.getTime() >= Date.parse(escalationDue(nextDue, calendar))),
  }
}
