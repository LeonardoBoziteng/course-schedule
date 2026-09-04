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

/** 导出时可统一覆盖的提前提醒选项（value=分钟，-1=不提醒） */
const REMIND_OVERRIDES: { value: number | null; label: string }[] = [
  { value: null, label: '跟随每门课的设置' },
  { value: -1, label: '本次导出全部不提醒' },
  { value: 0, label: '全部上课时提醒' },
  { value: 5, label: '全部提前 5 分钟' },
  { value: 10, label: '全部提前 10 分钟' },
  { value: 15, label: '全部提前 15 分钟' },
  { value: 30, label: '全部提前 30 分钟' },
]

export default function ExportCalendarModal({ term, onClose }: Props) {
  const courses = useCourses()
  const overrides = useOverrides()
  const [downloaded, setDownloaded] = useState(false)
  // null=跟随每门课编辑里的设置；数字=导出时统一覆盖
  const [remindOverride, setRemindOverride] = useState<number | null>(null)

  const events = useMemo(
    () => buildCalendarEvents(courses, overrides, term),
    [courses, overrides, term],
  )
  // 若用户选择了统一提醒时间，则覆盖所有事件的闹钟
  const exportEvents = useMemo(
    () =>
      remindOverride === null
        ? events
        : events.map((e) => ({ ...e, remindMinutes: remindOverride })),
    [events, remindOverride],
  )
  const summary = useMemo(() => summarizeEvents(exportEvents), [exportEvents])

  function handleDownload() {
    if (!window.confirm('添加后在日历清除比较麻烦，请仔细核对')) {
      return
    }
    const filename = `课程表-${term.name.replace(/[\\/:*?"<>|\s]+/g, '_')}-提醒.ics`
    downloadIcs(buildIcs(exportEvents), filename)
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

        <div className="form-row">
          <label className="form-row-label" htmlFor="export-remind">
            提前提醒
          </label>
          <select
            id="export-remind"
            className="input"
            value={remindOverride ?? 'course'}
            onChange={(e) => {
              const v = e.target.value
              setRemindOverride(v === 'course' ? null : Number(v))
            }}
          >
            {REMIND_OVERRIDES.map((opt) => (
              <option key={String(opt.value)} value={opt.value === null ? 'course' : String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="range-hint">
            默认跟随每门课编辑里设的提醒时间；也可在此统一覆盖本次导出的所有提醒
          </div>
        </div>

        <div className="step-list">
          <div>
            <b>1.</b> 点击下方按钮下载「.ics」文件
          </div>
          <div>
            <b>2.</b> 在 iPhone「文件」或浏览器下载中找到该文件，点开 → 添加到日历
          </div>
          <div>
            <b>3.</b> 之后由 iPhone「日历」自动提醒（提醒时间按上面所选，或每门课自己的设置）
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
