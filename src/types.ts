/** 星期：1=周一 … 7=周日 */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
  7: '周日',
}

/** 周次类型：每周都上 / 单周(奇数周) / 双周(偶数周) */
export type WeekType = 'every' | 'odd' | 'even'

export const WEEK_TYPE_LABELS: Record<WeekType, string> = {
  every: '每周',
  odd: '单周',
  even: '双周',
}

/**
 * 一门课程。
 * V2：可限定在某段周次内，并支持单周 / 双周重复。
 */
export interface Course {
  /** 唯一 ID */
  id: string
  /** 课程名称 */
  name: string
  /** 上课地点（可空字符串） */
  location: string
  /** 任课教师（可空字符串） */
  teacher: string
  /** 星期 1-7 */
  weekday: Weekday
  /** 开始节次（从 1 开始） */
  startPeriod: number
  /** 持续节数（>= 1） */
  periods: number
  /** 卡片展示颜色（hex，如 #4f6bf6） */
  color: string
  /**
   * 周次类型：
   * - every：每周都上（周次区间不生效）
   * - odd：单周上（需配合 weekStart/weekEnd 区间）
   * - even：双周上
   */
  weekType: WeekType
  /** 生效起始周（>=1；仅 odd/even 使用） */
  weekStart: number
  /** 生效结束周（>=weekStart；仅 odd/even 使用） */
  weekEnd: number
}

/** 新增课程时传入的数据（id 由存储层生成） */
export type CourseDraft = Omit<Course, 'id'>

