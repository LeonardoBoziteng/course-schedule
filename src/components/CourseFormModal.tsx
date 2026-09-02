import { useState } from 'react'
import type { FormEvent } from 'react'
import { COURSE_COLORS, DEFAULT_COURSE_COLOR } from '../lib/colors'
import { courseStore, findConflictingCourses } from '../lib/courseStore'
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
  onClose: () => void
}

function minMax(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

const WEEK_TYPES: WeekType[] = ['every', 'odd', 'even']

export default function CourseFormModal({ editor, totalWeeks, onClose }: Props) {
  const isEdit = editor.mode === 'edit'
  const existing = isEdit ? editor.course : null

  const [name, setName] = useState(existing?.name ?? '')
  const [location, setLocation] = useState(existing?.location ?? '')
  const [teacher, setTeacher] = useState(existing?.teacher ?? '')
  const [weekday, setWeekday] = useState<Weekday>(
    existing?.weekday ?? (editor.mode === 'create' ? editor.weekday : 1),
  )
  const [startPeriod, setStartPeriod] = useState<number>(
    existing?.startPeriod ??
      (editor.mode === 'create' ? minMax(editor.startPeriod, 1, PERIOD_COUNT) : 1),
  )
  const [periods, setPeriods] = useState<number>(existing?.periods ?? 1)
  const [color, setColor] = useState(existing?.color ?? DEFAULT_COURSE_COLOR)
  const [error, setError] = useState('')

  // —— 周次 ——
  const [weekType, setWeekType] = useState<WeekType>(existing?.weekType ?? 'every')
  const [weekStart, setWeekStart] = useState<number>(existing?.weekStart ?? 1)
  const [weekEnd, setWeekEnd] = useState<number>(
    existing?.weekEnd ?? Math.max(totalWeeks, 1),
  )
  const rangeOn = weekType !== 'every'

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

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('请填写课程名称')
      return
    }
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
      existing?.id,
    )
    if (conflict.length > 0) {
      setError(`该时段已排「${conflict.map((c) => c.name).join('、')}」，请调整时间或周次`)
      return
    }

    const data = {
      name: trimmedName,
      location: location.trim(),
      teacher: teacher.trim(),
      weekday,
      startPeriod,
      periods: safePeriods,
      color,
      weekType,
      weekStart: safeWeekStart,
      weekEnd: safeWeekEnd,
    }
    if (existing) {
      courseStore.updateCourse(existing.id, data)
    } else {
      courseStore.addCourse(data)
    }
    onClose()
  }

  function handleDelete() {
    if (!existing) return
    if (window.confirm(`删除「${existing.name}」？`)) {
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
          {rangeOn ? (
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
                {WEEK_TYPE_LABELS[weekType]} · 第 {safeWeekStart}–{safeWeekEnd} 周
              </div>
            </>
          ) : (
            <div className="range-hint">每周固定上课</div>
          )}
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
