import type { Course, CourseDraft, Weekday } from '../types'

const STORAGE_KEY = 'kcs.courses.v1'

/**
 * 课程数据存储层。
 * - 以 localStorage 持久化，数据仅保存在本机
 * - 内存中维护一份快照（稳定引用），供 React 订阅
 * - 写入/解析失败时静默降级为内存存储，不中断使用
 */
let courses: Course[] = []
let loaded = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** 基本字段校验，过滤掉被篡改/损坏的记录 */
function isValidCourse(value: unknown): value is Course {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.location === 'string' &&
    typeof c.teacher === 'string' &&
    typeof c.weekday === 'number' && Number.isInteger(c.weekday) && c.weekday >= 1 && c.weekday <= 7 &&
    typeof c.startPeriod === 'number' && Number.isInteger(c.startPeriod) && c.startPeriod >= 1 &&
    typeof c.periods === 'number' && Number.isInteger(c.periods) && c.periods >= 1 &&
    typeof c.color === 'string'
  )
}

function parse(raw: string | null): Course[] {
  if (raw === null) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter(isValidCourse)
  } catch {
    return []
  }
}

function readFromStorage(): Course[] {
  try {
    return parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

function writeToStorage(list: Course[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 隐私模式 / 存储不可用：仅在内存中保留
    console.warn('[courseStore] 本地存储写入失败，本次数据仅保留在内存中')
  }
}

function ensureLoaded() {
  if (loaded) return
  courses = readFromStorage()
  loaded = true
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function commit(next: Course[]) {
  courses = next
  writeToStorage(courses)
  emit()
}

export const courseStore = {
  /** 订阅课程列表变化，返回取消订阅函数 */
  subscribe(listener: () => void) {
    ensureLoaded()
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /** 返回当前课程数组（引用稳定，仅在有变化时更新） */
  getSnapshot(): Course[] {
    ensureLoaded()
    return courses
  },

  getCourses(): Course[] {
    ensureLoaded()
    return courses
  },

  /** 新增课程并持久化，返回带 id 的完整课程 */
  addCourse(draft: CourseDraft): Course {
    ensureLoaded()
    const course: Course = { ...draft, id: newId() }
    commit([...courses, course])
    return course
  },

  /** 按 id 局部更新课程 */
  updateCourse(id: string, patch: Partial<CourseDraft>) {
    ensureLoaded()
    commit(courses.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  },

  /** 按 id 删除课程 */
  removeCourse(id: string) {
    ensureLoaded()
    commit(courses.filter((c) => c.id !== id))
  },
}

/**
 * 查找与指定时间段冲突的课程（可用于新增 / 编辑时的重叠校验）。
 * 时间重叠判定：两段时间 [a, a+lenA) 与 [b, b+lenB) 不相交的条件是 a+lenA<=b 或 b+lenB<=a。
 */
export function findConflictingCourses(
  weekday: Weekday,
  startPeriod: number,
  periods: number,
  excludeId?: string,
): Course[] {
  ensureLoaded()
  const end = startPeriod + periods - 1
  return courses.filter(
    (c) =>
      c.weekday === weekday &&
      c.id !== excludeId &&
      !(end < c.startPeriod || startPeriod > c.startPeriod + c.periods - 1),
  )
}
