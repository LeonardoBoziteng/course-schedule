/** 单节课的时间段 */
export interface PeriodTime {
  /** 开始时间，如 08:00 */
  start: string
  /** 结束时间，如 08:45 */
  end: string
}

/** 一天的最大节次数（决定周视图行数） */
export const PERIOD_COUNT = 11

/**
 * 节次时间表（可后续在设置中调整，仅用于行标签展示，不影响课程数据）。
 *
 * 规则：每节 45 分钟、常规课间 10 分钟；
 * - 上午第 2、3 节之间为 30 分钟大课间
 * - 下午第 6、7 节之间为 30 分钟大课间
 * - 第 4 节后午休至 14:20；第 8 节后休息至 19:00
 */
export const DEFAULT_PERIODS: PeriodTime[] = [
  // —— 上午 ——
  { start: '08:00', end: '08:45' }, // 1
  { start: '08:55', end: '09:40' }, // 2
  // 大课间 30 分钟
  { start: '10:10', end: '10:55' }, // 3
  { start: '11:05', end: '11:50' }, // 4
  // —— 下午（午休至 14:20）——
  { start: '14:20', end: '15:05' }, // 5
  { start: '15:15', end: '16:00' }, // 6
  // 大课间 30 分钟
  { start: '16:30', end: '17:15' }, // 7
  { start: '17:25', end: '18:10' }, // 8
  // —— 晚上（休息至 19:00）——
  { start: '19:00', end: '19:45' }, // 9
  { start: '19:55', end: '20:40' }, // 10
  { start: '20:50', end: '21:35' }, // 11
]

/** 取某节的时间，超出默认表则返回 undefined */
export function getPeriodTime(period: number): PeriodTime | undefined {
  return DEFAULT_PERIODS[period - 1]
}
