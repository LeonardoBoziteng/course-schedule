import { useEffect, useReducer, useState } from 'react'
import type { FormEvent } from 'react'
import { useCourses } from '../hooks/useCourses'
import { courseStore } from '../lib/courseStore'
import { overrideStore } from '../lib/overrideStore'
import {
  MAX_TOTAL_WEEKS,
  termSettings,
  todayMondayString,
} from '../lib/termSettings'

interface Props {
  onClose: () => void
}

function nextYears(): number[] {
  const current = new Date().getFullYear()
  const list: number[] = []
  for (let y = current - 2; y <= current + 3; y += 1) list.push(y)
  return list
}

/** 按“学年第几学期”生成默认名称 */
function defaultTermName(yearA: number, semester: number): string {
  return `${yearA}-${yearA + 1}学年第${semester}学期`
}

export default function TermManagerModal({ onClose }: Props) {
  const courses = useCourses()
  const [, forceRender] = useReducer((x: number) => x + 1, 0)
  useEffect(() => termSettings.subscribe(forceRender), [])

  const terms = termSettings.getTerms()
  const activeId = termSettings.getActiveId()
  const canDelete = terms.length > 1

  // —— 新增学期表单 ——
  const [creating, setCreating] = useState(false)
  const [yearA, setYearA] = useState<number>(new Date().getFullYear())
  const [semester, setSemester] = useState(1)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(todayMondayString())
  const [totalWeeks, setTotalWeeks] = useState(20)
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  function resetForm() {
    const nowYear = new Date().getFullYear()
    setYearA(nowYear)
    setSemester(1)
    setName('')
    setStartDate(todayMondayString())
    setTotalWeeks(20)
    setError('')
  }

  function openCreate() {
    resetForm()
    setCreating(true)
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault()
    const parsed = new Date(`${startDate}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) {
      setError('开学日期无效')
      return
    }
    if (parsed.getDay() !== 1) {
      setError('开学日期需为周一（可填开学那周的周一）')
      return
    }
    const autoName = defaultTermName(yearA, semester)
    const finalName = name.trim() ? name.trim() : autoName
    // 名称冲突时自动加序号
    let uniqueName = finalName
    let suffix = 2
    while (terms.some((t) => t.name === uniqueName)) {
      uniqueName = `${finalName} (${suffix})`
      suffix += 1
    }
    termSettings.add({
      name: uniqueName,
      startDate,
      totalWeeks,
    })
    setCreating(false)
  }

  function switchTerm(id: string) {
    termSettings.setActive(id)
  }

  function handleDelete(id: string) {
    if (!canDelete) return
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      return
    }
    overrideStore.removeByTerm(id)
    courseStore.removeByTerm(id)
    termSettings.remove(id)
    setConfirmDeleteId(null)
  }

  const startYear = yearA

  return (
    <div
      className="modal-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet">
        <div className="sheet-handle" />
        <h2 className="sheet-title">学期管理</h2>
        <p className="term-tip">不同学期的课表相互独立，切换后互不影响。</p>

        <div className="term-list">
          {terms.map((t) => {
            const count = courses.filter((c) => c.termId === t.id).length
            const isActive = t.id === activeId
            return (
              <div key={t.id} className={isActive ? 'term-item active' : 'term-item'}>
                <button
                  type="button"
                  className="term-item-main"
                  onClick={() => switchTerm(t.id)}
                >
                  <span className="term-item-name">{t.name}</span>
                  <span className="term-item-meta">
                    {count} 门 · 开学 {t.startDate} · {t.totalWeeks} 周
                    {isActive ? ' · 使用中' : ''}
                  </span>
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    className="term-item-del"
                    onClick={() => handleDelete(t.id)}
                    aria-label="删除该学期"
                  >
                    {confirmDeleteId === t.id ? '确认?' : '删除'}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>

        {creating ? (
          <form className="term-create" onSubmit={handleCreate}>
            <div className="form-row">
              <label className="form-row-label" htmlFor="term-year">
                学年 / 学期
              </label>
              <div className="term-selects">
                <select
                  id="term-year"
                  className="input"
                  value={startYear}
                  onChange={(e) => setYearA(Number(e.target.value))}
                >
                  {nextYears().map((y) => (
                    <option key={y} value={y}>
                      {y}-{y + 1} 学年
                    </option>
                  ))}
                </select>
                <select
                  aria-label="学期"
                  className="input"
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
                >
                  <option value={1}>第 1 学期</option>
                  <option value={2}>第 2 学期</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <label className="form-row-label" htmlFor="term-name">
                学期名称
              </label>
              <input
                id="term-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={defaultTermName(startYear, semester)}
              />
            </div>

            <div className="form-row">
              <label className="form-row-label" htmlFor="term-start">
                开学日期（周一）
              </label>
              <input
                id="term-start"
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <div className="range-hint">该周为第 1 周，用于自动定位当前周次</div>
            </div>

            <div className="form-row">
              <label className="form-row-label" htmlFor="term-weeks">
                本学期总周数
              </label>
              <select
                id="term-weeks"
                className="input"
                value={totalWeeks}
                onChange={(e) => setTotalWeeks(Number(e.target.value))}
              >
                {Array.from({ length: MAX_TOTAL_WEEKS }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={w}>
                    {w} 周
                  </option>
                ))}
              </select>
            </div>

            {error ? <p className="error-text">{error}</p> : null}

            <div className="sheet-actions">
              <button type="button" className="btn btn-cancel" onClick={() => setCreating(false)}>
                取消
              </button>
              <button type="submit" className="btn btn-primary">
                添加并切换到该学期
              </button>
            </div>
          </form>
        ) : (
          <div className="sheet-actions">
            <button type="button" className="btn btn-cancel" onClick={onClose}>
              关闭
            </button>
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              + 新增学期
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
