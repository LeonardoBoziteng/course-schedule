import type { Course, Weekday, WeekType } from '../types'

/** 学期最大支持周数（防止异常数据） */
export const MAX_WEEKS = 52

const WEEK_TYPES: WeekType[] = ['every', 'odd', 'even']

export function isWeekType(value: unknown): value is WeekType {
  return value === 'every' || value === 'odd' || value === 'even'
}

/** 一门课可生效的周窗口（冲突/过滤判断用） */
export interface WeekWindow {
  weekType: WeekType
  weekStart: number
  weekEnd: number
}

/** 单双周是否命中第 week 周 */
export function parityHit(weekType: WeekType, week: number): boolean {
  if (weekType === 'every') return true
  const isOdd = week % 2 === 1
  return weekType === 'odd' ? isOdd : !isOdd
}

/** 第 week 周是否会上这门课（所有类型都要落在 weekStart..weekEnd 生效区间内） */
export function courseInWeek(course: WeekWindow, week: number): boolean {
  if (week < course.weekStart || week > course.weekEnd) return false
  return parityHit(course.weekType, week)
}

/** 两门课的周窗口是否会在某些周同时命中（用于冲突检测） */
export function weeksOverlap(a: WeekWindow, b: WeekWindow): boolean {
  const lo = Math.max(a.weekStart, b.weekStart)
  const hi = Math.min(a.weekEnd, b.weekEnd)
  if (lo > hi) return false
  if (a.weekType === 'every' || b.weekType === 'every') return true
  // 同为单周/同为双周：区间内必有同奇偶的周；奇偶不同则永远不重叠
  return a.weekType === b.weekType
}

function clampInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_WEEKS) {
    return value
  }
  return fallback
}

/**
 * 校验并补齐一条课程记录，兼容 V1 无周次字段的旧数据；
 * 损坏到无法修复的记录返回 null（过滤掉）。
 */
export function normalizeCourse(value: unknown): Course | null {
  if (typeof value !== 'object' || value === null) return null
  const c = value as Record<string, unknown>

  const validCore =
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.location === 'string' &&
    typeof c.teacher === 'string' &&
    typeof c.weekday === 'number' &&
    Number.isInteger(c.weekday) &&
    c.weekday >= 1 &&
    c.weekday <= 7 &&
    typeof c.startPeriod === 'number' &&
    Number.isInteger(c.startPeriod) &&
    c.startPeriod >= 1 &&
    typeof c.periods === 'number' &&
    Number.isInteger(c.periods) &&
    c.periods >= 1 &&
    typeof c.color === 'string'
  if (!validCore) return null

  let weekStart = clampInt(c.weekStart, 1)
  let weekEnd = clampInt(c.weekEnd, 20)
  if (weekEnd < weekStart) weekEnd = weekStart

  return {
    id: c.id as string,
    name: c.name as string,
    location: c.location as string,
    teacher: c.teacher as string,
    weekday: c.weekday as Weekday,
    startPeriod: c.startPeriod as number,
    periods: c.periods as number,
    color: c.color as string,
    weekType: isWeekType(c.weekType) ? c.weekType : 'every',
    weekStart,
    weekEnd,
    remindMinutes: clampRemind(c.remindMinutes),
  }
}

/** 提醒提前分钟数：-1 不提醒、0 上课时、>0 提前 N 分钟；默认 10 */
function clampRemind(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value === -1) return -1
    if (value >= 0 && value <= 180) return value
  }
  return 10
}

export const DEFAULT_REMIND_MINUTES = 10

/** 旧数据是否缺少周次字段（用于迁移后回写一次） */
export function lacksWeekFields(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !('weekType' in (value as Record<string, unknown>))
  )
}

export { WEEK_TYPES }
