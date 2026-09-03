import type { Course, Weekday } from '../types'

/**
 * 每周排布例外（WeekOverride）：
 * 同一门课（Course）通常覆盖若干周，位置默认一致；但当用户在某周拖动/延长，
 * 或在该周弹层里改“星期/节次/节数”时，只把“那一周”的位置记为一条例外。
 * 名称/地点/老师/颜色/单双周/周窗口等仍存于 Course 本体，跨周同步。
 */
export interface WeekOverride {
  id: string
  /** 关联的课程 id */
  courseId: string
  /** 课程所属学期 id */
  termId: string
  /** 生效于第几周 */
  week: number
  /** 该周的位置（覆盖 Course 本体的排布字段） */
  weekday: Weekday
  startPeriod: number
  periods: number
}

const STORAGE_KEY = 'kcs.overrides.v1'

let overrides: WeekOverride[] = []
let loaded = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function loadFromStorage(): WeekOverride[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    const list: WeekOverride[] = []
    for (const item of data) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      if (
        typeof o.courseId !== 'string' ||
        typeof o.termId !== 'string' ||
        typeof o.week !== 'number' ||
        typeof o.weekday !== 'number' ||
        typeof o.startPeriod !== 'number' ||
        typeof o.periods !== 'number'
      ) {
        continue
      }
      const weekday = o.weekday as Weekday
      if (weekday < 1 || weekday > 7) continue
      list.push({
        id: typeof o.id === 'string' && o.id ? o.id : `${o.courseId}:${o.week}`,
        courseId: o.courseId,
        termId: o.termId,
        week: Math.max(1, Math.floor(o.week)),
        weekday,
        startPeriod: Math.max(1, Math.floor(o.startPeriod)),
        periods: Math.max(1, Math.floor(o.periods)),
      })
    }
    return list
  } catch {
    return []
  }
}

function writeToStorage(list: WeekOverride[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    console.warn('[overrideStore] 本地存储写入失败，仅内存保留')
  }
}

function commit(next: WeekOverride[]) {
  overrides = next
  writeToStorage(overrides)
  emit()
}

function ensureLoaded() {
  if (loaded) return
  overrides = loadFromStorage()
  loaded = true
}

function newId(): string {
  return `ov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export const overrideStore = {
  subscribe(listener: () => void) {
    ensureLoaded()
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  /** 全部例外列表（引用稳定） */
  getSnapshot(): WeekOverride[] {
    ensureLoaded()
    return overrides
  },
  /** 课程在某周是否有例外 */
  find(courseId: string, week: number): WeekOverride | undefined {
    ensureLoaded()
    return overrides.find((o) => o.courseId === courseId && o.week === week)
  },
  /** 写入（或覆盖）某课程在某一周的位置例外 */
  set(courseId: string, termId: string, week: number, placement: {
    weekday: Weekday
    startPeriod: number
    periods: number
  }) {
    ensureLoaded()
    const existing = overrides.find((o) => o.courseId === courseId && o.week === week)
    const base = {
      courseId,
      termId,
      week,
      weekday: placement.weekday,
      startPeriod: Math.max(1, placement.startPeriod),
      periods: Math.max(1, placement.periods),
    }
    if (existing) {
      commit(
        overrides.map((o) =>
          o.courseId === courseId && o.week === week ? { ...o, ...base, id: o.id } : o,
        ),
      )
    } else {
      commit([...overrides, { ...base, id: newId() }])
    }
  },
  /** 删除某课程在某周的例外（例如恢复成默认排布） */
  remove(courseId: string, week: number) {
    ensureLoaded()
    commit(overrides.filter((o) => !(o.courseId === courseId && o.week === week)))
  },
  /** 删除课程时同步清除其所有周例外 */
  removeCourse(courseId: string) {
    ensureLoaded()
    commit(overrides.filter((o) => o.courseId !== courseId))
  },
  /** 删除学期时同步清除该学期所有例外 */
  removeByTerm(termId: string) {
    ensureLoaded()
    commit(overrides.filter((o) => o.termId !== termId))
  },
  /** 清空某学期例外（配合一键清除） */
  clearTerm(termId: string) {
    ensureLoaded()
    commit(overrides.filter((o) => o.termId !== termId))
  },
}

/** 取课程在某周的“实际显示位置”：有例外用例外，否则用 Course 本体 */
export function effectivePlacement(
  course: Course,
  week: number,
  list: WeekOverride[],
): { weekday: Weekday; startPeriod: number; periods: number } {
  const o = list.find((x) => x.courseId === course.id && x.week === week)
  if (o) {
    return { weekday: o.weekday, startPeriod: o.startPeriod, periods: o.periods }
  }
  return {
    weekday: course.weekday,
    startPeriod: course.startPeriod,
    periods: course.periods,
  }
}
