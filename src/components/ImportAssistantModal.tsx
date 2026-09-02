import { useState } from 'react'
import type { ChangeEvent } from 'react'
import type { CourseDraft } from '../types'
import { courseStore, findConflictingCourses } from '../lib/courseStore'
import { weeksOverlap } from '../lib/courseWeek'
import { parseExcelBuffer, type ParsedSheet } from '../lib/excelText'
import { buildImportPrompt } from '../lib/importPrompt'
import { parseImportText, validateImportData } from '../lib/importParser'
import { useCourses } from '../hooks/useCourses'

/** 两条候选课程是否在同一格（同星期、时间相交且周次相交） */
function slotOverlap(a: CourseDraft, b: CourseDraft): boolean {
  if (a.weekday !== b.weekday) return false
  const aEnd = a.startPeriod + a.periods - 1
  const bEnd = b.startPeriod + b.periods - 1
  if (aEnd < b.startPeriod || bEnd < a.startPeriod) return false
  return weeksOverlap(a, b)
}

interface Props {
  onClose: () => void
}

/** 快速试用的示例（模拟 AI 返回结果） */
const SAMPLE_RESULT = `[
  { "name": "高等数学", "location": "A-101", "teacher": "王老师", "weekday": 1, "startPeriod": 1, "periods": 2, "weekType": "every", "weekStart": 1, "weekEnd": 20 },
  { "name": "大学英语", "location": "B-302", "teacher": "李老师", "weekday": 3, "startPeriod": 3, "periods": 2, "weekType": "odd", "weekStart": 1, "weekEnd": 16 }
]`

interface Stage {
  importable: CourseDraft[]
  conflicts: string[]
  invalid: string[]
}

export default function ImportAssistantModal({ onClose }: Props) {
  const [sourceText, setSourceText] = useState('')
  const [promptText, setPromptText] = useState('')
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [aiOutput, setAiOutput] = useState('')
  const [stage, setStage] = useState<Stage | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  // —— 第二区：Excel 文件识别 ——
  const [excelFileName, setExcelFileName] = useState('')
  const [excelSheets, setExcelSheets] = useState<ParsedSheet[]>([])
  const [excelActive, setExcelActive] = useState(0)
  const [excelText, setExcelText] = useState('')
  // —— 数据管理 ——
  const courseCount = useCourses().length
  const [askClear, setAskClear] = useState(false)

  async function handleExcelFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMessage(null)
    try {
      const sheets = await parseExcelBuffer(await file.arrayBuffer())
      if (sheets.length === 0) {
        setMessage({ tone: 'err', text: '未能从该文件中解析出表格内容' })
        return
      }
      setExcelFileName(file.name)
      setExcelSheets(sheets)
      setExcelActive(0)
      setExcelText(sheets[0].text)
    } catch {
      setMessage({ tone: 'err', text: '解析失败：请确认是有效的 .xlsx / .xls / .csv 文件' })
    }
  }

  function selectExcelSheet(index: number) {
    const sheet = excelSheets[index]
    if (!sheet) return
    setExcelActive(index)
    setExcelText(sheet.text)
  }

  /** 把 Excel 提取的文本送到第一区流程，直接生成 AI 提示词 */
  function sendExcelToPrompt() {
    if (!excelText.trim()) {
      setMessage({ tone: 'err', text: '提取到的文本为空，请先选择文件' })
      return
    }
    setSourceText(excelText)
    setPromptText(buildImportPrompt(excelText))
    setCopiedPrompt(false)
    setMessage({
      tone: 'ok',
      text: '已用 Excel 内容生成提示词（见第①区），点「复制整段提示词」发给 AI 即可',
    })
  }

  function handleClearAll() {
    courseStore.clearAll()
    setAskClear(false)
    setStage(null)
    setMessage({ tone: 'ok', text: '已清除本学期全部课程' })
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
  }

  function handleGenerate() {
    if (!sourceText.trim()) {
      setMessage({ tone: 'err', text: '请先在上方粘贴你的课表原文' })
      return
    }
    setPromptText(buildImportPrompt(sourceText))
    setCopiedPrompt(false)
    setMessage(null)
  }

  async function handleCopyPrompt() {
    if (!promptText) return
    await copyText(promptText)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2000)
  }

  function handlePreview() {
    setStage(null)
    setMessage(null)
    if (!aiOutput.trim()) {
      setMessage({ tone: 'err', text: '请粘贴 AI 返回的结果' })
      return
    }
    let parsed: unknown
    try {
      parsed = parseImportText(aiOutput)
    } catch {
      setMessage({ tone: 'err', text: '不是合法的 JSON，请确认粘贴的是 AI 返回的 JSON 数组' })
      return
    }
    const { drafts, errors } = validateImportData(parsed)
    const importable: CourseDraft[] = []
    const conflictNames: string[] = []
    for (const draft of drafts) {
      // 1) 与已存课程冲突
      const storeConflict = findConflictingCourses({
        weekday: draft.weekday,
        startPeriod: draft.startPeriod,
        periods: draft.periods,
        weeks: draft,
      })
      // 2) 与本次导入内前面已通过的课在同一格（防 AI 重复输出同一条）
      const batchConflict = importable.filter((c) => slotOverlap(c, draft))
      const names = [
        ...storeConflict.map((c) => c.name),
        ...batchConflict.map((c) => c.name),
      ]
      if (names.length > 0) {
        conflictNames.push(`${draft.name}（与「${[...new Set(names)].join('、')}」在同一格，跳过）`)
      } else {
        importable.push(draft)
      }
    }
    setStage({ importable, conflicts: conflictNames, invalid: errors })
  }

  function handleImport() {
    if (!stage) return
    stage.importable.forEach((draft) => courseStore.addCourse(draft))
    setMessage({
      tone: 'ok',
      text: `已导入 ${stage.importable.length} 门课程。`,
    })
    setStage(null)
    setAiOutput('')
  }

  return (
    <div
      className="modal-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet sheet-import">
        <div className="sheet-handle" />
        <h2 className="sheet-title">AI 导入助手</h2>

        <p className="import-guide">
          ① 粘贴课表原文 → ② 复制提示词发给 AI（把 AI 返回的结果粘回）→ ③ 校验并导入
        </p>

        <div className="form-row">
          <label className="form-row-label" htmlFor="import-source">
            ① 课表原文（Excel 文字 / 网页复制的都可，越完整越好）
          </label>
          <textarea
            id="import-source"
            className="input textarea"
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="在这里粘贴……"
          />
          <div className="range-hint">只在本机处理，不会上传任何内容</div>
        </div>

        <div className="form-row">
          <button type="button" className="btn btn-primary btn-block" onClick={handleGenerate}>
            ② 生成可复制给 AI 的提示词
          </button>
        </div>

        {promptText ? (
          <div className="form-row">
            <label className="form-row-label">提示词（发给任意 AI，再把它返回的 JSON 粘回下方）</label>
            <textarea className="input textarea prompt-area" readOnly value={promptText} />
            <button type="button" className="btn btn-copy" onClick={handleCopyPrompt}>
              {copiedPrompt ? '已复制 ✓' : '复制整段提示词'}
            </button>
          </div>
        ) : null}

        <div className="form-row">
          <label className="form-row-label" htmlFor="import-result">
            ③ AI 返回的结果（JSON 数组）
          </label>
          <textarea
            id="import-result"
            className="input textarea mono"
            value={aiOutput}
            onChange={(e) => setAiOutput(e.target.value)}
            placeholder='如：[{"name":"高等数学","weekday":1,"startPeriod":1,"periods":2,...}]'
          />
          <div className="row-inline">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setAiOutput(SAMPLE_RESULT)}
            >
              填入示例试试
            </button>
            <button type="button" className="btn btn-primary" onClick={handlePreview}>
              校验预览
            </button>
          </div>
        </div>

        {stage ? (
          <div className="import-preview">
            <p className="preview-line">
              可导入 <b>{stage.importable.length}</b> 门
              {stage.conflicts.length > 0 ? ` · 冲突跳过 ${stage.conflicts.length} 条` : ''}
              {stage.invalid.length > 0 ? ` · 无效 ${stage.invalid.length} 条` : ''}
            </p>
            {stage.conflicts.length > 0 ? (
              <ul className="preview-list">
                {stage.conflicts.map((c, i) => (
                  <li key={`c-${i}`}>{c}</li>
                ))}
              </ul>
            ) : null}
            {stage.invalid.length > 0 ? (
              <ul className="preview-list invalid">
                {stage.invalid.map((e, i) => (
                  <li key={`e-${i}`}>{e}</li>
                ))}
              </ul>
            ) : null}
            {stage.importable.length > 0 ? (
              <button type="button" className="btn btn-primary btn-block" onClick={handleImport}>
                确认导入 {stage.importable.length} 门课程
              </button>
            ) : null}
          </div>
        ) : null}

        {message ? (
          <p className={message.tone === 'ok' ? 'import-message ok' : 'import-message err'}>
            {message.text}
          </p>
        ) : null}

        {/* ============ 第二区：Excel 文件识别 ============ */}
        <div className="import-zone-divider">
          <span>第二区 · Excel 文件识别</span>
        </div>

        <div className="form-row">
          <span className="form-row-label">
            选择教务导出的 Excel / CSV 文件（.xlsx .xls .csv，仅本机解析）
          </span>
          <input
            id="import-excel"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="file-input-hidden"
            onChange={handleExcelFile}
          />
          <label htmlFor="import-excel" className="btn btn-ghost file-btn">
            {excelFileName ? `已选择：${excelFileName}` : '选择 Excel 文件'}
          </label>

          {excelSheets.length > 1 ? (
            <div className="field sheet-picker">
              <select
                className="input"
                value={excelActive}
                onChange={(e) => selectExcelSheet(Number(e.target.value))}
              >
                {excelSheets.map((sheet, i) => (
                  <option key={sheet.name} value={i}>
                    {sheet.name}（{sheet.rows} 行 × {sheet.cols} 列）
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {excelSheets.length > 0 ? (
          <div className="form-row">
            <span className="form-row-label">提取出的表格文本（可手动微调后发 AI）</span>
            <textarea
              className="input textarea mono excel-text"
              value={excelText}
              onChange={(e) => setExcelText(e.target.value)}
            />
            <div className="row-inline">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => copyText(excelText)}
              >
                复制文本
              </button>
              <button type="button" className="btn btn-primary" onClick={sendExcelToPrompt}>
                用这份内容生成第①区提示词
              </button>
            </div>
            <div className="range-hint">
              表格会按“每行一行、单元格 Tab 分隔”转为文本；交给 AI 后可识别横排周次网格或
              列表式课表。返回的 JSON 请粘回第③区校验导入。
            </div>
          </div>
        ) : null}

        {/* ============ 数据管理：一键清除 ============ */}
        <div className="import-zone-divider">
          <span>数据管理</span>
        </div>

        <div className="clear-zone">
          {askClear ? (
            <>
              <p className="clear-warning">
                确定要清除本学期全部课程吗？共 {courseCount} 门，此操作不可恢复。
              </p>
              <div className="row-inline">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setAskClear(false)}
                >
                  取消
                </button>
                <button type="button" className="btn btn-danger" onClick={handleClearAll}>
                  确认清除 {courseCount} 门课程
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-danger btn-block"
              disabled={courseCount === 0}
              onClick={() => setAskClear(true)}
            >
              一键清除本学期课程（{courseCount} 门）
            </button>
          )}
        </div>

        <div className="sheet-actions">
          <button type="button" className="btn btn-cancel btn-full" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
