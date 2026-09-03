import { useState } from 'react'
import type { FormEvent } from 'react'
import { COURSE_COLORS, DEFAULT_COURSE_COLOR } from '../lib/colors'
import { courseStore, findConflictingCourses } from '../lib/courseStore'
import { courseInWeek, DEFAULT_REMIND_MINUTES } from '../lib/courseWeek'
import { effectivePlacement, overrideStore } from '../lib/overrideStore'
import { PERIOD_COUNT, getPeriodTime } from '../lib/periods'
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  WEEK_TYPE_LABELS,
  type Course,
  type Weekday,
  type WeekType,
} from '../types'

/** 弹层打开的两种来源：点击空格新增 / 点击卡片编辑 */
export type CourseEditorState =
  | { mode: 'create'; weekday: Weekday; startPeriod: number }
  | { mode: 'edit'; course: Course }
  | null

interface Props {
  editor: Exclude<CourseEditorState, null>
  /** 学期总周数（决定周次区间可选范围） */
  totalWeeks: number
  /** 当前正在查看/编辑的是第几周（编辑模式下位置只写到该周） */
  week: number
  onClose: () => void
}

function minMax(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function samePlacement(
  a: { weekday: Weekday; startPeriod: number; periods: number },
  b: { weekday: Weekday; startPeriod: number; periods: number },
): boolean {
  return a.weekday === b.weekday && a.startPeriod === b.startPeriod && a.periods === b.periods
}

const WEEK_TYPES: WeekType[] = ['every', 'odd', 'even']

/** 课前提醒选项：值=提前分钟数，-1 表示不提醒 */
const REMIND_OPTIONS: { value: number; label: string }[] = [
  { value: -1, label: '不提醒' },
  { value: 0, label: '上课时提醒' },
  { value: 5, label: '提前 5 分钟' },
  { value: 10, label: '提前 10 分钟' },
  { value: 15, label: '提前 15 分钟' },
  { value: 30, label: '提前 30 分钟' },
]

export default function CourseFormModal({ editor, totalWeeks, week, onClose }: Props) {
  const isEdit = editor.mode === 'edit'
  const existing = isEdit ? editor.course : null

  // 编辑时位置初值 = 本周实际显示位置（可能含每周例外）
  const effectiveNow =
    isEdit && existing
      ? effectivePlacement(existing, week, overrideStore.getSnapshot())
      : null

  const [name, setName] = useState(existing?.name ?? '')
  const [location, setLocation] = useState(existing?.location ?? '')
  const [teacher, setTeacher] = useState(existing?.teacher ?? '')
  const [weekday, setWeekday] = useState<Weekday>(
    (effectiveNow?.weekday as Weekday | undefined) ??
      existing?.weekday ??
      (editor.mode === 'create' ? editor.weekday : 1),
  )
  const [startPeriod, setStartPeriod] = useState<number>(
    effectiveNow?.startPeriod ??
      existing?.startPeriod ??
      (editor.mode === 'create' ? minMax(editor.startPeriod, 1, PERIOD_COUNT) : 1),
  )
  const [periods, setPeriods] = useState<number>(
    effectiveNow?.periods ?? existing?.periods ?? 1,
  )
  const [color, setColor] = useState(existing?.color ?? DEFAULT_COURSE_COLOR)
  const [remindMinutes, setRemindMinutes] = useState<number>(
    existing?.remindMinutes ?? DEFAULT_REMIND_MINUTES,
  )
  const [error, setError] = useState('')

  // —— 周次 ——
  const [weekType, setWeekType] = useState<WeekType>(existing?.weekType ?? 'every')
  const [weekStart, setWeekStart] = useState<number>(existing?.weekStart ?? 1)
  const [weekEnd, setWeekEnd] = useState<number>(
    existing?.weekEnd ?? Math.max(totalWeeks, 1),
  )
  // 节数上限：不能超出当天总节次
  const maxPeriods = PERIOD_COUNT - startPeriod + 1
  const safePeriods = minMax(periods, 1, maxPeriods)
  const safeWeekStart = minMax(weekStart, 1, totalWeeks)
  const safeWeekEnd = minMax(Math.max(weekEnd, safeWeekStart), safeWeekStart, totalWeeks)

  const lastPeriod = startPeriod + safePeriods - 1
  const firstTime = getPeriodTime(startPeriod)
  const lastTime = getPeriodTime(lastPeriod)
  const rangeHint =
    firstTime && lastTime
      ? startPeriod === lastPeriod
        ? `第 ${startPeriod} 节 · ${firstTime.start}–${firstTime.end}`
        : `第 ${startPeriod}–${lastPeriod} 节 · ${firstTime.start}–${lastTime.end}`
      : `第 ${startPeriod} 节起，共 ${safePeriods} 节`

  /** 编辑时：校验“当前这一周”是否与其他课程的实际显示位置冲突 */
  function currentWeekConflictNames(): string[] {
    if (!existing) return []
    const overridesNow = overrideStore.getSnapshot()
    const names: string[] = []
    for (const c of courseStore.getCourses()) {
      if (c.id === existing.id || c.termId !== existing.termId) continue
      if (!courseInWeek(c, week)) continue
      const p = effectivePlacement(c, week, overridesNow)
      if (p.weekday !== weekday) continue
      const cEnd = p.startPeriod + p.periods - 1
      const myEnd = startPeriod + safePeriods - 1
      if (!(myEnd < p.startPeriod || startPeriod > cEnd)) {
        names.push(c.name)
      }
    }
    return names
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('请填写课程名称')
      return
    }

    const coreData = {
      name: trimmedName,
      location: location.trim(),
      teacher: teacher.trim(),
      color,
      weekType,
      weekStart: safeWeekStart,
      weekEnd: safeWeekEnd,
      remindMinutes,
    }

    if (existing) {
      // —— 编辑模式 ——
      const names = currentWeekConflictNames()
      if (names.length > 0) {
        setError(`第 ${week} 周该时段已排「${[...new Set(names)].join('、')}」，请调整时间或周次`)
        return
      }
      // 颜色等身份信息写课程本体（所有周同步）
      courseStore.updateCourse(existing.id, coreData)
      // 位置（星期/节次/节数）只影响当前这一周
      const desired = { weekday, startPeriod, periods: safePeriods }
      const currentPlacement = effectivePlacement(existing, week, overrideStore.getSnapshot())
      if (!samePlacement(currentPlacement, desired)) {
        const basePlacement = {
          weekday: existing.weekday,
          startPeriod: existing.startPeriod,
          periods: existing.periods,
        }
        if (samePlacement(desired, basePlacement)) {
          // 与全局默认一致：撤销该周例外
          overrideStore.remove(existing.id, week)
        } else {
          overrideStore.set(existing.id, existing.termId ?? '', week, desired)
        }
      }
    } else {
      // —— 新增模式（位置作为全局默认排布） ——
      const conflict = findConflictingCourses(
        {
          weekday,
          startPeriod,
          periods: safePeriods,
          weeks: {
            weekType,
            weekStart: safeWeekStart,
            weekEnd: safeWeekEnd,
          },
        },
        undefined,
      )
      if (conflict.length > 0) {
        setError(`该时段已排「${conflict.map((c) => c.name).join('、')}」，请调整时间或周次`)
        return
      }
      courseStore.addCourse({ ...coreData, weekday, startPeriod, periods: safePeriods })
    }
    onClose()
  }

  function handleDelete() {
    if (!existing) return
    if (window.confirm(`删除「${existing.name}」？该课程所有周都会一并移除。`)) {
      overrideStore.removeCourse(existing.id)
      courseStore.removeCourse(existing.id)
      onClose()
    }
  }

  return (
    <div
      className="modal-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form className="sheet" onSubmit={handleSubmit}>
        <div className="sheet-handle" />
        <h2 className="sheet-title">{isEdit ? '编辑课程' : '添加课程'}</h2>
        {isEdit ? (
          <div className="edit-week-note">
            位置（星期/节次/节数）只影响<strong>第 {week} 周</strong>；颜色、名称等对所有周生效
          </div>
        ) : null}

        <div className="form-row">
          <label className="form-row-label" htmlFor="course-name">
            课程名称 *
          </label>
          <input
            id="course-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：高等数学"
            autoFocus
          />
        </div>

        <div className="form-row">
          <label className="form-row-label" htmlFor="course-location">
            上课地点
          </label>
          <input
            id="course-location"
            className="input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="如：A-101"
          />
        </div>

        <div className="form-row">
          <label className="form-row-label" htmlFor="course-teacher">
            任课教师
          </label>
          <input
            id="course-teacher"
            className="input"
            value={teacher}
            onChange={(e) => setTeacher(e.target.value)}
            placeholder="如：王老师"
          />
        </div>

        <div className="form-row">
          <span className="form-row-label">星期</span>
          <div className="day-options">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                className={day === weekday ? 'day-chip on' : 'day-chip'}
                onClick={() => setWeekday(day)}
              >
                {WEEKDAY_LABELS[day]}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <span className="form-row-label">节次</span>
          <div className="period-row">
            <div className="field">
              <select
                className="input"
                value={startPeriod}
                onChange={(e) => setStartPeriod(Number(e.target.value))}
              >
                {Array.from({ length: PERIOD_COUNT }, (_, i) => i + 1).map((p) => (
                  <option key={p} value={p}>
                    第 {p} 节
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <select
                className="input"
                value={safePeriods}
                onChange={(e) => setPeriods(Number(e.target.value))}
              >
                {Array.from({ length: maxPeriods }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    连上 {n} 节
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="range-hint">{rangeHint}</div>
        </div>

        <div className="form-row">
          <span className="form-row-label">周次</span>
          <div className="day-options">
            {WEEK_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={type === weekType ? 'day-chip on' : 'day-chip'}
                onClick={() => setWeekType(type)}
              >
                {WEEK_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          {(() => {
            const label =
              weekType === 'every'
                ? '区间内每周都上'
                : weekType === 'odd'
                  ? '区间内单周(奇)上'
                  : '区间内双周(偶)上'
            return (
              <>
                <div className="period-row week-range-row">
                  <div className="field">
                    <select
                      className="input"
                      value={safeWeekStart}
                      onChange={(e) => {
                        const next = Number(e.target.value)
                        setWeekStart(next)
                        if (weekEnd < next) setWeekEnd(next)
                      }}
                    >
                      {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => (
                        <option key={w} value={w}>
                          第 {w} 周起
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <select
                      className="input"
                      value={safeWeekEnd}
                      onChange={(e) => setWeekEnd(Number(e.target.value))}
                    >
                      {Array.from({ length: totalWeeks - safeWeekStart + 1 }, (_, i) => {
                        const w = safeWeekStart + i
                        return (
                          <option key={w} value={w}>
                            到第 {w} 周止
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </div>
                <div className="range-hint">
                  {label} · 第 {safeWeekStart}–{safeWeekEnd} 周
                </div>
              </>
            )
          })()}
        </div>

        <div className="form-row">
          <span className="form-row-label">颜色</span>
          <div className="color-options">
            {COURSE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`选择颜色 ${c}`}
                className={c === color ? 'color-swatch selected' : 'color-swatch'}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="form-row">
          <label className="form-row-label" htmlFor="remind-minutes">
            课前提醒
          </label>
          <select
            id="remind-minutes"
            className="input"
            value={remindMinutes}
            onChange={(e) => setRemindMinutes(Number(e.target.value))}
          >
            {REMIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="range-hint">
            导出到系统日历后，由 iPhone“日历”在对应时间通知你
          </div>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="sheet-actions">
          {isEdit ? (
            <button type="button" className="btn btn-danger" onClick={handleDelete}>
              删除
            </button>
          ) : null}
          <button type="button" className="btn btn-cancel" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary">
            保存
          </button>
        </div>
      </form>
    </div>
  )
}
