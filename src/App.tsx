import WeeklyGrid from './components/WeeklyGrid'
import { useCourses } from './hooks/useCourses'

function App() {
  const courses = useCourses()

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">课程表</h1>
      </header>

      <main className="app-main">
        <WeeklyGrid />
      </main>

      <footer className="app-footer">已保存 {courses.length} 门课程 · 数据仅保存在本机</footer>
    </div>
  )
}

export default App
