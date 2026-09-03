import { useMemo, useState } from 'react'
import { useCourses } from '../hooks/useCourses'
import { useOverrides } from '../hooks/useOverrides'
import type { TermSettings } from '../lib/termSettings'
import {
  buildCalendarEvents,
  buildIcs,
  downloadIcs,
  summarizeEvents,
} from '../lib/ical'

interface Props {
  term: TermSettings
  onClose: () => void
}

export default function ExportCalendarModal({ term, onClose }: Props) {
  const courses = useCourses()
  const overrides = useOverrides()
  const [downloaded, setDownloaded] = useState(false)

  const events = useMemo(
    () => buildCalendarEvents(courses, overrides, term),
    [courses, overrides, term],
  )
  const summary = useMemo(() => summarizeEvents(events), [events])

  function handleDownload() {
    const filename = `课程表-${term.name.replace(/[\\/:*?"<>|\s]+/g, '_')}-提醒.ics`
    downloadIcs(buildIcs(events), filename)
    setDownloaded(true)
  }

  return (
    <div
      className="modal-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet">
        <div className="sheet-handle" />
        <h2 className="sheet-title">导出到系统日历</h2>

        <p className="term-tip">
          把「{term.name}」的课程生成日历事件，导入 iPhone「日历」后，由系统在
          每门课设定的时间前提醒你（无需推送服务器）。
        </p>

        <div className="export-summary">
          <div>
            将生成 <b>{summary.count}</b> 个课程事件
          </div>
          {summary.count > 0 ? (
            <div className="range-hint">
              其中 {summary.remindCount} 个带提醒闹钟 · 覆盖 {summary.start} 至 {summary.end}
            </div>
          ) : (
            <div className="range-hint">当前学期还没有课程，无法导出</div>
          )}
        </div>

        <div className="step-list">
          <div>
            <b>1.</b> 点击下方按钮下载「.ics」文件
          </div>
          <div>
            <b>2.</b> 在 iPhone「文件」或浏览器下载中找到该文件，点开 → 添加到日历
          </div>
          <div>
            <b>3.</b> 之后由 iPhone「日历」自动提醒（每门课的提醒时间在编辑课程里设置）
          </div>
        </div>

        <div className="export-warning">
          课表有变动时请重新导出导入；如需同步删除旧事件，可先在「日历」中删除之前导入的课程
          （搜索课程名即可），再导入新版本，避免重复。
        </div>

        {downloaded ? (
          <div className="error-text ok-text">已生成文件，请在 iPhone 上下载记录里点开它并「添加到日历」</div>
        ) : null}

        <div className="sheet-actions">
          <button type="button" className="btn btn-cancel" onClick={onClose}>
            关闭
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={summary.count === 0}
            onClick={handleDownload}
          >
            生成并下载 .ics
          </button>
        </div>
      </div>
    </div>
  )
}
