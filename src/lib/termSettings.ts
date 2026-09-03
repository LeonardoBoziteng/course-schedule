/**
 * 学期（Term）管理：
 * - 支持多个学期并存（如不同学年/上下学期），每个学期独立的开学日期与总周数
 * - 学期之间互不影响，课程数据通过 termId 归属到具体学期
 * - 持久化 key：kcs.terms.v2（学期数组） / kcs.activeTerm.v2（当前激活学期 id）
 * - 兼容旧版：kcs.term.v1 单学期数据会自动迁移为首个学期
 */
const TERMS_KEY = 'kcs.terms.v2'
const ACTIVE_KEY = 'kcs.activeTerm.v2'
const LEGACY_KEY = 'kcs.term.v1'

export const DEFAULT_TOTAL_WEEKS = 20
export const MAX_TOTAL_WEEKS = 30

/** 学期设置（id 标识唯一学期） */
export interface TermSettings {
  /** 唯一 ID */
  id: string
  /** 学期名称（展示用，如 2025-2026学年第1学期） */
  name: string
  /** 总周数 */
  totalWeeks: number
  /** 开学日期（必须是周一），格式 YYYY-MM-DD */
  startDate: string
}

let terms: TermSettings[] = []
let activeId = ''
let loaded = false
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

/** 学期第 week 周的周一（开学日为第 1 周周一；startDate 非法返回 null） */
export function termWeekMonday(startDate: string, week: number): Date | null {
  const base = parseDate(startDate)
  if (!base) return null
  const d = new Date(base.getTime())
  d.setDate(d.getDate() + (week - 1) * 7)
  return d
}

/** 学期第 week 周的某一天（weekday：1=周一…7=周日） */
export function termWeekdayDate(
  startDate: string,
  week: number,
  weekday: number,
): Date | null {
  const monday = termWeekMonday(startDate, week)
  if (!monday) return null
  const d = new Date(monday.getTime())
  d.setDate(d.getDate() + (weekday - 1))
  return d
}

/** 日期短格式：M/D */
export function monthDay(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** 该周的日期范围标签，如 "9/7–9/13"（非法开学日返回 null） */
export function termWeekRangeLabel(startDate: string, week: number): string | null {
  const monday = termWeekMonday(startDate, week)
  if (!monday) return null
  const sunday = new Date(monday.getTime())
  sunday.setDate(sunday.getDate() + 6)
  return `${monthDay(monday)}–${monthDay(sunday)}`
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

function newId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 将未知数据清洗成合法学期，非法返回 null */
function sanitizeTerm(data: unknown): TermSettings | null {
  if (!data || typeof data !== 'object') return null
  const item = data as Record<string, unknown>
  const totalWeeks =
    typeof item.totalWeeks === 'number' &&
    Number.isInteger(item.totalWeeks) &&
    item.totalWeeks >= 1 &&
    item.totalWeeks <= MAX_TOTAL_WEEKS
      ? item.totalWeeks
      : DEFAULT_TOTAL_WEEKS
  const name =
    typeof item.name === 'string' && item.name.trim()
      ? item.name.trim().slice(0, 40)
      : '本学期'
  return {
    id: typeof item.id === 'string' && item.id ? item.id : newId(),
    name,
    totalWeeks,
    startDate: validStartDate(item.startDate),
  }
}

/** 读取旧版单学期数据（kcs.term.v1），用于首次迁移 */
function loadLegacy(): TermSettings | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const term = sanitizeTerm(JSON.parse(raw))
    return term ? { ...term, id: 't_legacy' } : null
  } catch {
    return null
  }
}

function loadTerms(): TermSettings[] {
  try {
    const raw = localStorage.getItem(TERMS_KEY)
    if (raw) {
      const data: unknown = JSON.parse(raw)
      if (Array.isArray(data)) {
        const list = data.map(sanitizeTerm).filter((t): t is TermSettings => t !== null)
        if (list.length > 0) return list
      }
    }
  } catch {
    /* 损坏则重建 */
  }
  const legacy = loadLegacy()
  if (legacy) return [legacy]
  return [
    {
      id: 't_default',
      name: '本学期',
      totalWeeks: DEFAULT_TOTAL_WEEKS,
      startDate: todayMondayString(),
    },
  ]
}

function persist() {
  try {
    localStorage.setItem(TERMS_KEY, JSON.stringify(terms))
    localStorage.setItem(ACTIVE_KEY, activeId)
  } catch {
    console.warn('[termSettings] 保存失败，仅内存保留')
  }
}

function ensureLoaded() {
  if (loaded) return
  terms = loadTerms()
  const savedActive = localStorage.getItem(ACTIVE_KEY)
  activeId =
    savedActive && terms.some((t) => t.id === savedActive) ? savedActive : terms[0].id
  loaded = true
  persist()
}

/** 返回学期总数（供其他模块在加载时拿到兜底学期） */
export function termCount(): number {
  ensureLoaded()
  return terms.length
}

export const termSettings = {
  subscribe(listener: () => void) {
    ensureLoaded()
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  /** 当前激活学期（引用稳定，仅在变化时更新） */
  getSnapshot(): TermSettings {
    ensureLoaded()
    const active = terms.find((t) => t.id === activeId) ?? terms[0]
    return active
  },
  get(): TermSettings {
    return termSettings.getSnapshot()
  },
  getTerms(): TermSettings[] {
    ensureLoaded()
    return terms
  },
  getActiveId(): string {
    ensureLoaded()
    return activeId
  },
  setActive(id: string) {
    ensureLoaded()
    if (!terms.some((t) => t.id === id)) return
    if (activeId === id) return
    activeId = id
    persist()
    emit()
  },
  /** 修改当前激活学期 */
  update(patch: Partial<Omit<TermSettings, 'id'>>) {
    ensureLoaded()
    const current = termSettings.getSnapshot()
    const next: TermSettings = {
      ...current,
      name:
        typeof patch.name === 'string'
          ? patch.name.trim().slice(0, 40) || current.name
          : current.name,
      totalWeeks:
        typeof patch.totalWeeks === 'number'
          ? Math.min(Math.max(Math.round(patch.totalWeeks), 1), MAX_TOTAL_WEEKS)
          : current.totalWeeks,
      startDate: patch.startDate
        ? validStartDate(patch.startDate)
        : current.startDate,
    }
    terms = terms.map((t) => (t.id === current.id ? next : t))
    persist()
    emit()
  },
  /** 新增学期（会自动设为激活） */
  add(data: Omit<TermSettings, 'id'>): TermSettings {
    ensureLoaded()
    const term: TermSettings = {
      id: newId(),
      name: data.name.trim().slice(0, 40) || '本学期',
      totalWeeks: Math.min(Math.max(Math.round(data.totalWeeks), 1), MAX_TOTAL_WEEKS),
      startDate: validStartDate(data.startDate),
    }
    terms = [...terms, term]
    activeId = term.id
    persist()
    emit()
    return term
  },
  /** 删除学期（至少保留一个；返回是否成功） */
  remove(id: string): boolean {
    ensureLoaded()
    if (terms.length <= 1) return false
    if (!terms.some((t) => t.id === id)) return false
    terms = terms.filter((t) => t.id !== id)
    if (activeId === id) activeId = terms[0].id
    persist()
    emit()
    return true
  },
}

/** 用于展示格式化：学期简称 */
export function termShortName(term: TermSettings): string {
  return term.name.length > 14 ? `${term.name.slice(0, 14)}…` : term.name
}
