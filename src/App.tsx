import { useEffect, useState } from 'react'
import ImportAssistantModal from './components/ImportAssistantModal'
import TermManagerModal from './components/TermManagerModal'
import TermSettingsModal from './components/TermSettingsModal'
import WeeklyGrid from './components/WeeklyGrid'
import WeekToolbar from './components/WeekToolbar'
import { useCourses } from './hooks/useCourses'
import { useTermSettings } from './hooks/useTermSettings'
import { weekNumberFor } from './lib/termSettings'

function minMax(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function App() {
  const courses = useCourses()
  const term = useTermSettings()

  const currentWeek = weekNumberFor(term.startDate, new Date(), term.totalWeeks)
  const [selectedWeek, setSelectedWeek] = useState(currentWeek)
  const [showTermModal, setShowTermModal] = useState(false)
  const [showTermManager, setShowTermManager] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  // view=仅浏览（锁定课表，防止误碰）；edit=可拖动/拖底延长/空格新增
  const [mode, setMode] = useState<'view' | 'edit'>(() => {
    const saved = localStorage.getItem('kcs.mode')
    return saved === 'edit' || saved === 'view' ? saved : 'view'
  })

  // 记住上次使用的模式
  useEffect(() => {
    localStorage.setItem('kcs.mode', mode)
  }, [mode])

  // 切换学期：定位到该学期当前所处的周
  useEffect(() => {
    setSelectedWeek(currentWeek)
  }, [term.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 学期设置变化后，把当前查看周收敛到合法范围内
  useEffect(() => {
    setSelectedWeek((week) => minMax(week, 1, term.totalWeeks))
  }, [term.totalWeeks])

  const activeCourseCount = courses.filter((c) => c.termId === term.id).length

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">课程表</h1>
        <div className="header-actions">
          <div className="mode-switch" role="group" aria-label="页面模式">
            <button
              type="button"
              className={mode === 'view' ? 'active' : ''}
              onClick={() => setMode('view')}
            >
              浏览
            </button>
            <button
              type="button"
              className={mode === 'edit' ? 'active' : ''}
              onClick={() => setMode('edit')}
            >
              编辑
            </button>
          </div>
          {mode === 'edit' ? (
            <button
              type="button"
              className="header-import-btn"
              onClick={() => setShowImportModal(true)}
            >
              导入
            </button>
          ) : null}
        </div>
      </header>

      <div className="app-toolbar">
        <div className="term-switch-row">
          <button
            type="button"
            className="term-chip"
            onClick={() => setShowTermManager(true)}
            aria-label="学期管理"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14v11zM7 11h5v5H7z"
              />
            </svg>
            {term.name}
          </button>
          <button
            type="button"
            className="term-manage-btn"
            onClick={() => setShowTermManager(true)}
          >
            切换 / 管理学期
          </button>
        </div>
        <WeekToolbar
          termName={term.name}
          totalWeeks={term.totalWeeks}
          selectedWeek={selectedWeek}
          isCurrentWeek={selectedWeek === currentWeek}
          onChangeWeek={(week) => setSelectedWeek(minMax(week, 1, term.totalWeeks))}
          onGoCurrent={() => setSelectedWeek(currentWeek)}
          onOpenSettings={() => setShowTermModal(true)}
        />
        {mode === 'edit' ? (
          <div className="mode-hint">编辑模式：按住课程拖动 · 按住底部横杠上下延长 · 点空格新增</div>
        ) : null}
      </div>

      <main className="app-main">
        <WeeklyGrid
          termId={term.id}
          selectedWeek={selectedWeek}
          totalWeeks={term.totalWeeks}
          editable={mode === 'edit'}
        />
      </main>

      <footer className="app-footer">
        {term.name} · 第 {selectedWeek} 周 · 已保存 {activeCourseCount} 门课程 · 数据仅保存在本机
        {mode === 'view' ? ' · 浏览模式（切到“编辑”可改动课表）' : ''}
      </footer>

      {showTermManager ? (
        <TermManagerModal onClose={() => setShowTermManager(false)} />
      ) : null}

      {showTermModal ? (
        <TermSettingsModal term={term} onClose={() => setShowTermModal(false)} />
      ) : null}

      {showImportModal ? (
        <ImportAssistantModal onClose={() => setShowImportModal(false)} />
      ) : null}
    </div>
  )
}

export default App
