import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  MAX_TOTAL_WEEKS,
  termSettings,
  type TermSettings,
} from '../lib/termSettings'

interface Props {
  term: TermSettings
  onClose: () => void
}

export default function TermSettingsModal({ term, onClose }: Props) {
  const [name, setName] = useState(term.name)
  const [startDate, setStartDate] = useState(term.startDate)
  const [totalWeeks, setTotalWeeks] = useState(term.totalWeeks)
  const [error, setError] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!startDate) {
      setError('请选择开学日期')
      return
    }
    const date = new Date(`${startDate}T00:00:00`)
    if (Number.isNaN(date.getTime())) {
      setError('开学日期无效')
      return
    }
    if (date.getDay() !== 1) {
      setError('开学日期需为周一（可查看开学那周的周一）')
      return
    }
    termSettings.update({ name, startDate, totalWeeks })
    onClose()
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
        <h2 className="sheet-title">学期设置</h2>

        <div className="form-row">
          <label className="form-row-label" htmlFor="term-name">
            学期名称
          </label>
          <input
            id="term-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：2026 春季学期"
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
