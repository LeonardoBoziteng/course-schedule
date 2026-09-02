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

/** 第 week 周是否会上这门课 */
export function courseInWeek(course: WeekWindow, week: number): boolean {
  if (course.weekType === 'every') return true
  if (week < course.weekStart || week > course.weekEnd) return false
  return parityHit(course.weekType, week)
}

/** 两门课的周窗口是否有重叠（用于冲突检测） */
export function weeksOverlap(a: WeekWindow, b: WeekWindow): boolean {
  if (a.weekType === 'every' || b.weekType === 'every') return true
  if (a.weekType !== b.weekType) return false
  return Math.max(a.weekStart, b.weekStart) <= Math.min(a.weekEnd, b.weekEnd)
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
  }
}

/** 旧数据是否缺少周次字段（用于迁移后回写一次） */
export function lacksWeekFields(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !('weekType' in (value as Record<string, unknown>))
  )
}

export { WEEK_TYPES }
