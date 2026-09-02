import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useCourses } from '../hooks/useCourses'
import { courseInWeek } from '../lib/courseWeek'
import { courseStore, findConflictingCourses } from '../lib/courseStore'
import { PERIOD_COUNT, getPeriodTime } from '../lib/periods'
import { WEEKDAYS, WEEKDAY_LABELS } from '../types'
import type { Course, Weekday } from '../types'
import CourseFormModal, { type CourseEditorState } from './CourseFormModal'

/* 周视图尺寸常量（像素） */
const GUTTER_W = 64 // 左侧节次栏宽
const DAY_W = 118 // 每个星期列宽
const HEADER_H = 40 // 顶部星期栏高
const ROW_H = 58 // 每节课行高
/** 卡片底部多少像素内按下可进入“延长课时”模式 */
const RESIZE_ZONE = 18
/** 移动超过该距离才判定为拖拽（否则视为点击） */
const MOVE_THRESHOLD = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

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

/** 拖拽目标（格子坐标） */
interface DragTarget {
  weekday: number
  startPeriod: number
  periods: number
  valid: boolean
}

function CourseCard({
  name,
  location,
  color,
  weekTag,
  dragging,
  onPointerDown,
  onOpenKeyboard,
}: {
  name: string
  location: string
  color: string
  weekTag: string | null
  dragging: boolean
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onOpenKeyboard: () => void
}) {
  return (
    <button
      type="button"
      className={dragging ? 'course-card is-dragging' : 'course-card'}
      style={{ backgroundColor: color }}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenKeyboard()
        }
      }}
    >
      <span className="course-name">
        {weekTag ? <span className="course-week-tag">{weekTag}</span> : null}
        {name}
      </span>
      {location ? <span className="course-location">{location}</span> : null}
      <span className="card-resize-handle" aria-hidden="true" />
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

  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  // —— 拖拽状态（用 ref 存瞬态，state 只驱动视觉）——
  interface DragSession {
    course: Course
    mode: 'move' | 'resize'
    startX: number
    startY: number
    moved: boolean
  }
  const dragRef = useRef<DragSession | null>(null)
  const targetRef = useRef<DragTarget | null>(null)
  const [preview, setPreview] = useState<DragTarget | null>(null)
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null)

  // 只显示本周会上的课程
  const visibleCourses = courses.filter((c) => courseInWeek(c, selectedWeek))

  // 今天对应的星期：JS getDay() 周日=0，转成 周一=1 … 周日=7
  const todayWeekday = ((new Date().getDay() + 6) % 7) + 1

  /** 手指纵坐标对应的“行内第几节”候选（1 起），并夹取到边界内 */
  function periodAt(clientY: number): number | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (clientY < rect.top + HEADER_H) return 1
    const row = Math.floor((clientY - rect.top - HEADER_H) / ROW_H) + 1
    return clamp(row, 1, PERIOD_COUNT)
  }

  function weekdayAt(clientX: number): number {
    const canvas = canvasRef.current
    if (!canvas) return 1
    const rect = canvas.getBoundingClientRect()
    const col = Math.floor((clientX - rect.left) / DAY_W)
    return clamp(col + 1, 1, WEEKDAYS.length)
  }

  /** 根据拖拽会话与当前坐标算出目标格 */
  function computeTarget(session: DragSession, clientX: number, clientY: number): DragTarget | null {
    const course = session.course
    const period = periodAt(clientY)
    if (period === null) return null

    let target: { weekday: number; startPeriod: number; periods: number }
    if (session.mode === 'resize') {
      target = {
        weekday: course.weekday,
        startPeriod: course.startPeriod,
        periods: clamp(period - course.startPeriod + 1, 1, PERIOD_COUNT - course.startPeriod + 1),
      }
    } else {
      const canvas = canvasRef.current
      const slotTop =
        (canvas?.getBoundingClientRect().top ?? 0) +
        HEADER_H +
        (course.startPeriod - 1) * ROW_H
      // 保持手指相对卡片顶部的行偏移，避免拖拽时卡片“跳动”
      const grabOffset = clamp(Math.floor((clientY - slotTop) / ROW_H), 0, course.periods - 1)
      const startPeriod = clamp(
        period - grabOffset,
        1,
        PERIOD_COUNT - course.periods + 1,
      )
      target = {
        weekday: weekdayAt(clientX),
        startPeriod,
        periods: course.periods,
      }
    }

    const conflict = findConflictingCourses(
      {
        weekday: target.weekday as Weekday,
        startPeriod: target.startPeriod,
        periods: target.periods,
        weeks: course,
      },
      course.id,
    )
    return { ...target, valid: conflict.length === 0 }
  }

  // 全局指针监听：一次挂载，读取 ref 状态
  useEffect(() => {
    function autoScroll(clientX: number, clientY: number) {
      const scroller = scrollRef.current
      if (scroller) {
        const rect = scroller.getBoundingClientRect()
        if (clientX > rect.right - 46) scroller.scrollLeft += 14
        else if (clientX < rect.left + 46) scroller.scrollLeft -= 14
      }
      if (clientY > window.innerHeight - 60) window.scrollBy(0, 16)
      else if (clientY < 70) window.scrollBy(0, -16)
    }

    function onPointerMove(event: PointerEvent) {
      const session = dragRef.current
      if (!session) return
      if (
        !session.moved &&
        Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < MOVE_THRESHOLD
      ) {
        return
      }
      session.moved = true
      event.preventDefault()
      autoScroll(event.clientX, event.clientY)
      const target = computeTarget(session, event.clientX, event.clientY)
      targetRef.current = target
      setPreview(target)
      setActiveCourseId(session.course.id)
    }

    function finishDrag(event: PointerEvent) {
      const session = dragRef.current
      dragRef.current = null
      if (!session) return
      if (session.moved) {
        const target = targetRef.current
        if (target && target.valid) {
          courseStore.updateCourse(session.course.id, {
            weekday: target.weekday as Weekday,
            startPeriod: target.startPeriod,
            periods: target.periods,
          })
        }
        // 冲突/越界：不保存，卡片留在原处（“回弹”）
      } else if (event.type === 'pointerup') {
        // 原地松手视为点击 → 打开编辑
        setEditor({ mode: 'edit', course: session.course })
      }
      targetRef.current = null
      setPreview(null)
      setActiveCourseId(null)
    }

    function cancelDrag() {
      dragRef.current = null
      targetRef.current = null
      setPreview(null)
      setActiveCourseId(null)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', cancelDrag)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', cancelDrag)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, course: Course) {
    const rect = event.currentTarget.getBoundingClientRect()
    const nearBottom = rect.bottom - event.clientY <= RESIZE_ZONE
    dragRef.current = {
      course,
      mode: nearBottom ? 'resize' : 'move',
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
  }

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
        <div className="week-scroll" ref={scrollRef}>
          <div
            className="week-canvas"
            ref={canvasRef}
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
                  dragging={activeCourseId === course.id}
                  onPointerDown={(e) => beginDrag(e, course)}
                  onOpenKeyboard={() => setEditor({ mode: 'edit', course })}
                />
              </div>
            ))}

            {/* 拖拽落点预览 */}
            {preview ? (
              <div
                className={preview.valid ? 'drag-preview ok' : 'drag-preview bad'}
                style={areaStyle(preview.weekday, preview.startPeriod + 1, preview.periods)}
              />
            ) : null}
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
