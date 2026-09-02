import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useCourses } from '../hooks/useCourses'
import { courseInWeek } from '../lib/courseWeek'
import { PERIOD_COUNT, getPeriodTime } from '../lib/periods'
import { WEEKDAYS, WEEKDAY_LABELS } from '../types'
import type { Course } from '../types'
import CourseFormModal, { type CourseEditorState } from './CourseFormModal'

/* 周视图尺寸常量（像素） */
const GUTTER_W = 64 // 左侧节次栏宽（需容纳「08:00–08:45」）
const DAY_W = 118 // 每个星期列宽
const HEADER_H = 40 // 顶部星期栏高
const ROW_H = 58 // 每节课行高

/** 可横滑区域的 7 个星期列 */
function dayCols(): string {
  return WEEKDAYS.map(() => `${DAY_W}px`).join(' ')
}

function gridRows(): string {
  return `${HEADER_H}px repeat(${PERIOD_COUNT}, ${ROW_H}px)`
}

/** 定位一个网格元素：col 为列序号(1 起)，row 为行序号(1 起)，span 为跨行数 */
function areaStyle(col: number, row: number, span = 1): CSSProperties {
  return { gridColumn: col, gridRow: `${row} / span ${span}` }
}

/** 网格线：垂直分隔线位于各星期列交界，水平分隔线位于各节次行上缘 */
function GridLines() {
  const verticals = Array.from({ length: WEEKDAYS.length - 1 }, (_, i) => (
    <div
      key={`vl-${i}`}
      className="grid-line-vertical"
      style={{ left: (i + 1) * DAY_W }}
    />
  ))
  const horizontals = Array.from({ length: PERIOD_COUNT }, (_, i) => (
    <div
      key={`hl-${i}`}
      className="grid-line-horizontal"
      style={{ top: HEADER_H + i * ROW_H }}
    />
  ))
  return (
    <>
      {verticals}
      {horizontals}
    </>
  )
}

function CourseCard({
  name,
  location,
  color,
  weekTag,
  onOpen,
}: {
  name: string
  location: string
  color: string
  weekTag: string | null
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className="course-card"
      style={{ backgroundColor: color }}
      onClick={onOpen}
    >
      <span className="course-name">
        {weekTag ? <span className="course-week-tag">{weekTag}</span> : null}
        {name}
      </span>
      {location ? <span className="course-location">{location}</span> : null}
    </button>
  )
}

interface WeeklyGridProps {
  /** 当前查看的是第几周（用于过滤单双周课程） */
  selectedWeek: number
  /** 学期总周数（透传给编辑弹层限制周区间） */
  totalWeeks: number
}

export default function WeeklyGrid({ selectedWeek, totalWeeks }: WeeklyGridProps) {
  const courses = useCourses()
  const [editor, setEditor] = useState<CourseEditorState>(null)

  // 只显示本周会上的课程
  const visibleCourses = courses.filter((c) => courseInWeek(c, selectedWeek))

  // 今天对应的星期：JS getDay() 周日=0，转成 周一=1 … 周日=7
  const todayWeekday = ((new Date().getDay() + 6) % 7) + 1

  return (
    <div className="week-grid">
      <div className="week-body">
        {/* 冻结在左侧的节次栏（不随星期横向滚动） */}
        <div
          className="week-gutter-panel"
          style={{
            gridTemplateColumns: `${GUTTER_W}px`,
            gridTemplateRows: gridRows(),
          }}
        >
          <div className="week-corner" style={areaStyle(1, 1)} />
          {Array.from({ length: PERIOD_COUNT }, (_, i) => i + 1).map((p) => {
            const time = getPeriodTime(p)
            return (
              <div
                key={`g-${p}`}
                className="week-period-gutter"
                style={areaStyle(1, p + 1)}
              >
                <span className="gutter-no">{p}</span>
                {time ? (
                  <span className="gutter-time">
                    {time.start}–{time.end}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* 星期列横向滚动区域 */}
        <div className="week-scroll">
          <div
            className="week-canvas"
            style={{
              gridTemplateColumns: dayCols(),
              gridTemplateRows: gridRows(),
            }}
          >
            {/* 网格线（位于底层） */}
            <GridLines />

            {/* 星期标题 */}
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className={[
                  'week-day-header',
                  day >= 6 ? 'weekend' : '',
                  day === todayWeekday ? 'today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={areaStyle(day, 1)}
              >
                {WEEKDAY_LABELS[day]}
              </div>
            ))}

            {/* 空格点击层：点任意空白格新增课程 */}
            {WEEKDAYS.flatMap((day) =>
              Array.from({ length: PERIOD_COUNT }, (_, i) => i + 1).map((p) => (
                <button
                  key={`cell-${day}-${p}`}
                  type="button"
                  className="week-cell"
                  style={areaStyle(day, p + 1)}
                  aria-label={`新增课程：${WEEKDAY_LABELS[day]} 第${p}节`}
                  onClick={() => setEditor({ mode: 'create', weekday: day, startPeriod: p })}
                />
              )),
            )}

            {/* 课程卡片（覆盖在空格点击层之上，仅渲染本周课程） */}
            {visibleCourses.map((course: Course) => (
              <div
                key={course.id}
                className="course-slot"
                style={areaStyle(
                  course.weekday,
                  course.startPeriod + 1,
                  course.periods,
                )}
              >
                <CourseCard
                  name={course.name}
                  location={course.location}
                  color={course.color}
                  weekTag={
                    course.weekType === 'odd'
                      ? '单'
                      : course.weekType === 'even'
                        ? '双'
                        : null
                  }
                  onOpen={() => setEditor({ mode: 'edit', course })}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 空状态引导（不拦截点击，点空格即可添加） */}
      {courses.length === 0 ? (
        <div className="empty-hint" aria-hidden="true">
          <span className="empty-hint-title">还没有课程</span>
          <span className="empty-hint-sub">点击任意空白格子即可添加</span>
        </div>
      ) : null}

      {editor ? (
        <CourseFormModal
          editor={editor}
          totalWeeks={totalWeeks}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  )
}
