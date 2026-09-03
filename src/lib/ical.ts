import type { Course } from '../types'
import { courseInWeek } from './courseWeek'
import type { WeekOverride } from './overrideStore'
import { effectivePlacement } from './overrideStore'
import { DEFAULT_PERIODS } from './periods'
import type { TermSettings } from './termSettings'

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 'YYYY-MM-DD' 解析（按本地时间） */
function parseYmd(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime())
  d.setDate(d.getDate() + days)
  return d
}

/** 输出本地浮动时间的 .ics 时刻：YYYYMMDDTHHMMSS */
function icsDateTime(date: Date, hhmm: string): string {
  const [hh, mm] = hhmm.split(':').map(Number)
  const d = new Date(date.getTime())
  d.setHours(hh, mm, 0, 0)
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}${pad2(d.getMinutes())}00`
  )
}

/** 当前时间（供 DTSTAMP） */
function nowStamp(): string {
  const d = new Date()
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  )
}

/** 转义 .ics 文本字段 */
function esc(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function timeOf(period: number): { start: string; end: string } | null {
  const t = DEFAULT_PERIODS[period - 1]
  return t ? { start: t.start, end: t.end } : null
}

export interface CalendarEvent {
  uid: string
  summary: string
  description: string
  location: string
  /** 本地时刻 'YYYYMMDDTHHMMSS' */
  start: string
  end: string
  /** 提前分钟数；-1 表示不提醒 */
  remindMinutes: number
}

/** 按整学期展开：每周每天每课生成一条事件（尊重生效周/单双周/每周例外） */
export function buildCalendarEvents(
  courses: Course[],
  overrides: WeekOverride[],
  term: TermSettings,
): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const termStart = parseYmd(term.startDate)
  if (!termStart) return events

  for (let week = 1; week <= term.totalWeeks; week += 1) {
    for (const course of courses) {
      if (course.termId !== term.id) continue
      if (!courseInWeek(course, week)) continue
      const p = effectivePlacement(course, week, overrides)
      const startTime = timeOf(p.startPeriod)
      if (!startTime) continue
      const endPeriod = p.startPeriod + p.periods - 1
      const endTime = timeOf(endPeriod)
      if (!endTime) continue

      const date = addDays(termStart, (week - 1) * 7 + (p.weekday - 1))
      const start = icsDateTime(date, startTime.start)
      const end = icsDateTime(date, endTime.end)

      const parts: string[] = []
      if (course.teacher) parts.push(`教师：${course.teacher}`)
      if (course.weekType !== 'every') {
        parts.push(`周次：第${week}周（${course.weekType === 'odd' ? '单周' : '双周'}）`)
      }
      const remind = course.remindMinutes ?? 10
      parts.push(
        remind === -1
          ? '提醒：不提醒'
          : remind === 0
            ? '提醒：上课时'
            : `提醒：提前 ${remind} 分钟`,
      )
      events.push({
        uid: `${course.id}-w${week}@course-schedule`,
        summary: course.name,
        description: parts.join('；'),
        location: course.location,
        start,
        end,
        remindMinutes: remind,
      })
    }
  }
  return events
}

/** 序列化成 .ics 文本 */
export function buildIcs(events: CalendarEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CourseSchedule//CN',
    'CALSCALE:GREGORIAN',
  ]
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${esc(e.uid)}`,
      `DTSTAMP:${nowStamp()}`,
      `DTSTART:${e.start}`,
      `DTEND:${e.end}`,
      `SUMMARY:${esc(e.summary)}`,
    )
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`)
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
    if (e.remindMinutes !== -1) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER:-PT${e.remindMinutes}M`,
        `DESCRIPTION:${esc(e.summary)}上课提醒`,
        'END:VALARM',
      )
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

/** 生成下载并触发保存 */
export function downloadIcs(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** 供展示用的事件统计 */
export function summarizeEvents(events: CalendarEvent[]): {
  count: number
  remindCount: number
  start: string
  end: string
} {
  if (events.length === 0) return { count: 0, remindCount: 0, start: '', end: '' }
  const starts = events.map((e) => e.start.slice(0, 8)).sort()
  const fmt = (yyyymmdd: string) =>
    `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
  return {
    count: events.length,
    remindCount: events.filter((e) => e.remindMinutes !== -1).length,
    start: fmt(starts[0]),
    end: fmt(starts[starts.length - 1]),
  }
}
