interface WeekToolbarProps {
  termName: string
  totalWeeks: number
  selectedWeek: number
  isCurrentWeek: boolean
  /** 本周的真实日期范围，如 "9/7–9/13"；无则隐藏 */
  dateRange?: string | null
  onChangeWeek: (week: number) => void
  onGoCurrent: () => void
  onOpenSettings: () => void
}

export default function WeekToolbar({
  termName,
  totalWeeks,
  selectedWeek,
  isCurrentWeek,
  dateRange,
  onChangeWeek,
  onGoCurrent,
  onOpenSettings,
}: WeekToolbarProps) {
  return (
    <div className="week-toolbar">
      <div className="toolbar-week">
        <button
          type="button"
          className="toolbar-arrow"
          aria-label="上一周"
          disabled={selectedWeek <= 1}
          onClick={() => onChangeWeek(selectedWeek - 1)}
        >
          ‹
        </button>
        <span className="toolbar-title">
          <span className="toolbar-title-line">
            {termName} · 第 <b>{selectedWeek}</b> 周 / {totalWeeks}
          </span>
          {dateRange ? <span className="toolbar-dates">{dateRange}</span> : null}
        </span>
        <button
          type="button"
          className="toolbar-arrow"
          aria-label="下一周"
          disabled={selectedWeek >= totalWeeks}
          onClick={() => onChangeWeek(selectedWeek + 1)}
        >
          ›
        </button>
      </div>

      <div className="toolbar-actions">
        {!isCurrentWeek ? (
          <button type="button" className="toolbar-today" onClick={onGoCurrent}>
            回本周
          </button>
        ) : null}
        <button
          type="button"
          className="toolbar-gear"
          aria-label="学期设置"
          onClick={onOpenSettings}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.34.61.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54a7.3 7.3 0 0 0 1.62-.94l2.39.96c.21.12.48.01.61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
