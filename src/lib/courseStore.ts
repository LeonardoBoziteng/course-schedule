import type { Course, CourseDraft, Weekday } from '../types'
import {
  lacksWeekFields,
  normalizeCourse,
  weeksOverlap,
  type WeekWindow,
} from './courseWeek'
import { termSettings } from './termSettings'

const STORAGE_KEY = 'kcs.courses.v1'

/**
 * 课程数据存储层。
 * - 以 localStorage 持久化，数据仅保存在本机
 * - 内存中维护一份快照（稳定引用），供 React 订阅
 * - 读取时自动兼容旧数据：补齐周次字段；缺 termId 的课程归属到当前激活学期
 */
let courses: Course[] = []
let loaded = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function parse(raw: string | null): { list: Course[]; migrated: boolean } {
  if (raw === null) return { list: [], migrated: false }
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return { list: [], migrated: false }
    let migrated = false
    const list: Course[] = []
    for (const item of data) {
      if (lacksWeekFields(item)) migrated = true
      const course = normalizeCourse(item)
      if (course) list.push(course)
    }
    return { list, migrated }
  } catch {
    return { list: [], migrated: false }
  }
}

function readFromStorage(): { list: Course[]; migrated: boolean } {
  try {
    return parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    return { list: [], migrated: false }
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
  const { list, migrated } = readFromStorage()
  // 多学期迁移：缺 termId 的旧课程归属到当前激活学期（首次会落成第一个学期）
  const fallbackTermId = termSettings.getActiveId()
  let termMigrated = false
  const assigned = list.map((c) => {
    if (!c.termId) {
      termMigrated = true
      return { ...c, termId: fallbackTermId }
    }
    return c
  })
  courses = assigned
  loaded = true
  if (migrated || termMigrated) writeToStorage(courses)
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

  /** 新增课程并持久化，返回带 id 的完整课程（缺省归属当前激活学期） */
  addCourse(draft: CourseDraft, termId?: string): Course {
    ensureLoaded()
    const course: Course = {
      ...draft,
      id: newId(),
      termId: termId ?? draft.termId ?? termSettings.getActiveId(),
    }
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

  /** 删除某学期的全部课程（删除学期时调用） */
  removeByTerm(termId: string) {
    ensureLoaded()
    commit(courses.filter((c) => c.termId !== termId))
  },

  /** 一键清除当前学期的全部课程（不可恢复） */
  clearAll(termId: string = termSettings.getActiveId()) {
    ensureLoaded()
    commit(courses.filter((c) => c.termId !== termId))
  },
}

export interface ConflictCandidate {
  weekday: Weekday
  startPeriod: number
  periods: number
  weeks: WeekWindow
  /** 候选课程所属学期；缺省视为当前激活学期 */
  termId?: string
}

/**
 * 查找与候选课程冲突的已存课程（仅限同一学期内）。
 * 同时满足：同学期、同星期、时间段相交、周窗口相交。
 */
export function findConflictingCourses(
  candidate: ConflictCandidate,
  excludeId?: string,
): Course[] {
  ensureLoaded()
  const termId = candidate.termId ?? termSettings.getActiveId()
  const end = candidate.startPeriod + candidate.periods - 1
  return courses.filter(
    (c) =>
      c.termId === termId &&
      c.weekday === candidate.weekday &&
      c.id !== excludeId &&
      !(
        end < c.startPeriod ||
        candidate.startPeriod > c.startPeriod + c.periods - 1
      ) &&
      weeksOverlap(c, candidate.weeks),
  )
}
