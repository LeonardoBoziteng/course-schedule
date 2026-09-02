import { useEffect, useState } from 'react'
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

  // 学期设置变化后，把当前查看周收敛到合法范围内
  useEffect(() => {
    setSelectedWeek((week) => minMax(week, 1, term.totalWeeks))
  }, [term.totalWeeks])

  function onClose() {
    setShowTermModal(false)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">课程表</h1>
      </header>

      <div className="app-toolbar">
        <WeekToolbar
          termName={term.name}
          totalWeeks={term.totalWeeks}
          selectedWeek={selectedWeek}
          isCurrentWeek={selectedWeek === currentWeek}
          onChangeWeek={(week) => setSelectedWeek(minMax(week, 1, term.totalWeeks))}
          onGoCurrent={() => setSelectedWeek(currentWeek)}
          onOpenSettings={() => setShowTermModal(true)}
        />
      </div>

      <main className="app-main">
        <WeeklyGrid selectedWeek={selectedWeek} totalWeeks={term.totalWeeks} />
      </main>

      <footer className="app-footer">
        第 {selectedWeek} 周 · 已保存 {courses.length} 门课程 · 数据仅保存在本机
      </footer>

      {showTermModal ? (
        <TermSettingsModal term={term} onClose={onClose} />
      ) : null}
    </div>
  )
}

export default App
