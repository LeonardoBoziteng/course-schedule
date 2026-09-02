const STORAGE_KEY = 'kcs.term.v1'

export const DEFAULT_TOTAL_WEEKS = 20
export const MAX_TOTAL_WEEKS = 30

/** 学期设置 */
export interface TermSettings {
  /** 学期名称（纯展示） */
  name: string
  /** 总周数 */
  totalWeeks: number
  /** 开学日期（必须是周一），格式 YYYY-MM-DD */
  startDate: string
}

let term: TermSettings | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** 取某周一的日期（若当天是周日则回退到上周一） */
export function mondayOf(date: Date = new Date()): Date {
  const d = startOfDay(date)
  const weekdayOffset = (d.getDay() + 6) % 7 // 周一=0 … 周日=6
  d.setDate(d.getDate() - weekdayOffset)
  return d
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (formatDate(d) !== value) return null
  return startOfDay(d)
}

/** 本周周一对应的日期字符串（作为开学日默认值） */
export function todayMondayString(): string {
  return formatDate(mondayOf(new Date()))
}

/** 由开学日(周一)推算：date 落在学期第几周（1 起，越界时收敛到边界） */
export function weekNumberFor(
  startDate: string,
  date: Date = new Date(),
  totalWeeks: number = DEFAULT_TOTAL_WEEKS,
): number {
  const start = parseDate(startDate)
  if (!start) return 1
  const diffDays = Math.floor((startOfDay(date).getTime() - start.getTime()) / 86400000)
  const week = Math.floor(diffDays / 7) + 1
  if (week < 1) return 1
  if (week > totalWeeks) return totalWeeks
  return week
}

function validStartDate(value: unknown): string {
  if (typeof value === 'string' && parseDate(value)) return value
  return todayMondayString()
}

function load(): TermSettings {
  const base: TermSettings = {
    name: '本学期',
    totalWeeks: DEFAULT_TOTAL_WEEKS,
    startDate: todayMondayString(),
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const data = JSON.parse(raw) as Record<string, unknown>
    const totalWeeks =
      typeof data.totalWeeks === 'number' &&
      Number.isInteger(data.totalWeeks) &&
      data.totalWeeks >= 1 &&
      data.totalWeeks <= MAX_TOTAL_WEEKS
        ? data.totalWeeks
        : DEFAULT_TOTAL_WEEKS
    return {
      name:
        typeof data.name === 'string' && data.name.trim()
          ? data.name.trim().slice(0, 20)
          : base.name,
      totalWeeks,
      startDate: validStartDate(data.startDate),
    }
  } catch {
    return base
  }
}

function write(next: TermSettings) {
  term = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    console.warn('[termSettings] 保存失败，仅内存保留')
  }
  emit()
}

export const termSettings = {
  subscribe(listener: () => void) {
    if (!term) term = load()
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  /** 返回学期设置（引用稳定） */
  getSnapshot(): TermSettings {
    if (!term) term = load()
    return term
  },
  get(): TermSettings {
    return termSettings.getSnapshot()
  },
  update(patch: Partial<TermSettings>) {
    const current = termSettings.getSnapshot()
    const next: TermSettings = {
      ...current,
      ...patch,
      totalWeeks:
        typeof patch.totalWeeks === 'number'
          ? Math.min(Math.max(Math.round(patch.totalWeeks), 1), MAX_TOTAL_WEEKS)
          : current.totalWeeks,
      startDate: patch.startDate ? validStartDate(patch.startDate) : current.startDate,
      name: typeof patch.name === 'string' ? patch.name.trim().slice(0, 20) || current.name : current.name,
    }
    write(next)
  },
}
