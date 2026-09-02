import type { CourseDraft, WeekType } from '../types'
import { DEFAULT_COURSE_COLOR } from './colors'
import { MAX_WEEKS } from './courseWeek'
import { PERIOD_COUNT } from './periods'

export interface ImportParseResult {
  /** 解析成功、可入库的课程（尚未做冲突校验） */
  drafts: CourseDraft[]
  /** 逐条无效的原因 */
  errors: string[]
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

function asWeekType(value: unknown): WeekType {
  return value === 'odd' || value === 'even' || value === 'every'
    ? value
    : 'every'
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

/**
 * 合并同一门课的相邻/重叠节次。
 * 部分 AI 会把“第1-2节连上”拆成两条 periods=1 的记录（第1节一条、第2节一条），
 * 这里按 名称+地点+教师+星期+周次窗口 归组，把相接或重叠的时间段并成一条。
 */
function coalesceAdjacent(drafts: CourseDraft[]): CourseDraft[] {
  const groups = new Map<string, CourseDraft[]>()
  const identity = (c: CourseDraft) =>
    `${c.name}\u0000${c.location}\u0000${c.teacher}\u0000${c.weekday}\u0000${c.weekType}\u0000${c.weekStart}\u0000${c.weekEnd}`

  for (const draft of drafts) {
    const key = identity(draft)
    const list = groups.get(key)
    if (list) list.push(draft)
    else groups.set(key, [draft])
  }

  const merged: CourseDraft[] = []
  for (const list of groups.values()) {
    list.sort((a, b) => a.startPeriod - b.startPeriod)
    let current = list[0]
    for (let i = 1; i < list.length; i++) {
      const next = list[i]
      const currentEnd = current.startPeriod + current.periods - 1
      if (next.startPeriod <= currentEnd + 1) {
        // 相接或重叠 → 合并成并集
        const end = Math.max(currentEnd, next.startPeriod + next.periods - 1)
        current = {
          ...current,
          periods: Math.min(end - current.startPeriod + 1, PERIOD_COUNT - current.startPeriod + 1),
        }
      } else {
        merged.push(current)
        current = next
      }
    }
    merged.push(current)
  }
  return merged
}

/** 去掉 AI 可能加上的 markdown 围栏等干扰后解析 JSON */
export function parseImportText(text: string): unknown {
  let cleaned = text.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(cleaned)
  if (fence) cleaned = fence[1].trim()
  return JSON.parse(cleaned)
}

/** 校验 AI 返回的 JSON，转成可入库的 CourseDraft 列表 */
export function validateImportData(data: unknown): ImportParseResult {
  if (!Array.isArray(data) || data.length === 0) {
    return {
      drafts: [],
      errors: ['未解析到任何课程：请粘贴 AI 返回的 JSON 数组'],
    }
  }

  const drafts: CourseDraft[] = []
  const errors: string[] = []

  data.forEach((raw, index) => {
    const tag = `第 ${index + 1} 条`
    if (typeof raw !== 'object' || raw === null) {
      errors.push(`${tag}：不是对象，已跳过`)
      return
    }
    const item = raw as Record<string, unknown>
    const name = asTrimmedString(item.name)
    if (!name) {
      errors.push(`${tag}：缺少课程名称 name，已跳过`)
      return
    }

    const weekday = asFiniteNumber(item.weekday)
    if (weekday === null || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      errors.push(`${tag}「${name}」：weekday 需为 1-7 的整数，已跳过`)
      return
    }

    const startPeriod = asFiniteNumber(item.startPeriod)
    if (
      startPeriod === null ||
      !Number.isInteger(startPeriod) ||
      startPeriod < 1 ||
      startPeriod > PERIOD_COUNT
    ) {
      errors.push(`${tag}「${name}」：startPeriod 需为 1-${PERIOD_COUNT} 的整数，已跳过`)
      return
    }

    const periodsRaw = asFiniteNumber(item.periods)
    const periodsMax = PERIOD_COUNT - startPeriod + 1
    const periods =
      periodsRaw === null || !Number.isInteger(periodsRaw) || periodsRaw < 1
        ? 1
        : Math.min(periodsRaw, periodsMax)

    const weekStartRaw = asFiniteNumber(item.weekStart)
    const weekEndRaw = asFiniteNumber(item.weekEnd)
    let weekStart =
      weekStartRaw !== null && Number.isInteger(weekStartRaw)
        ? Math.min(Math.max(weekStartRaw, 1), MAX_WEEKS)
        : 1
    let weekEnd =
      weekEndRaw !== null && Number.isInteger(weekEndRaw)
        ? Math.min(Math.max(weekEndRaw, 1), MAX_WEEKS)
        : 20
    if (weekEnd < weekStart) weekEnd = weekStart

    drafts.push({
      name,
      location: asTrimmedString(item.location),
      teacher: asTrimmedString(item.teacher),
      weekday: weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      startPeriod,
      periods,
      color: isHexColor(item.color) ? item.color : DEFAULT_COURSE_COLOR,
      weekType: asWeekType(item.weekType),
      weekStart,
      weekEnd,
    })
  })

  // AI 常把连上的一门课拆成多条相邻记录，先合并再返回
  return { drafts: coalesceAdjacent(drafts), errors }
}
