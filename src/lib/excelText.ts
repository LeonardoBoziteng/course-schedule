import type { Range, WorkSheet } from 'xlsx'

export interface ParsedSheet {
  name: string
  rows: number
  cols: number
  /** 表格内容：每行一行、单元格以 Tab 分隔，便于后续交给 AI 或提示词识别 */
  text: string
}

const MAX_ROWS = 500
const MAX_COLS = 60

function cellValue(sheet: WorkSheet, address: string): string {
  const cell = sheet[address]
  if (!cell) return ''
  const raw =
    typeof cell.w === 'string'
      ? cell.w
      : cell.v !== undefined && cell.v !== null
        ? String(cell.v)
        : ''
  return raw.replace(/\s+/g, ' ').trim()
}

/**
 * 收集合并单元格区域：把左上角的值补写到区域内每个格子，并记录纵向覆盖行数。
 * 教务导出的“连上 N 节”常是纵向合并单元格，若不展开/标注，文本阶段就会丢失跨节信息，
 * 导致下游（含 AI）只能推断出 1~2 节。
 */
function buildMergeOverrides(sheet: WorkSheet, merges: Range[] | undefined): {
  overrides: Map<string, string>
  /** 纵向合并的首格地址 -> 覆盖行数 */
  topSpans: Map<string, number>
} {
  const overrides = new Map<string, string>()
  const topSpans = new Map<string, number>()
  if (!merges) return { overrides, topSpans }
  for (const range of merges) {
    const { s, e } = range
    const source = cellValue(sheet, `${encodeCol(s.c)}${s.r + 1}`)
    if (!source) continue
    const topAddress = `${encodeCol(s.c)}${s.r + 1}`
    const rowSpan = e.r - s.r + 1
    if (rowSpan > 1) topSpans.set(topAddress, rowSpan)
    for (let r = s.r; r <= e.r; r++) {
      for (let c = s.c; c <= e.c; c++) {
        const address = `${encodeCol(c)}${r + 1}`
        if (address !== topAddress) overrides.set(address, source)
      }
    }
  }
  return { overrides, topSpans }
}

function encodeCol(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** 读取 ArrayBuffer 里的 .xlsx/.xls/.csv，返回各工作表转成的文本 */
export async function parseExcelBuffer(buffer: ArrayBuffer): Promise<ParsedSheet[]> {
  const xlsx = await import('xlsx')
  const workbook = xlsx.read(buffer, { type: 'array' })
  const result: ParsedSheet[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const range = sheet['!ref']
    if (!range) continue
    const decoded = xlsx.utils.decode_range(range)
    const { overrides, topSpans } = buildMergeOverrides(sheet, sheet['!merges'])
    const rows = Math.min(decoded.e.r - decoded.s.r + 1, MAX_ROWS)
    const cols = Math.min(decoded.e.c - decoded.s.c + 1, MAX_COLS)
    const lines: string[] = []
    for (let r = 0; r < rows; r++) {
      const cells: string[] = []
      let rowHasContent = false
      for (let c = 0; c < cols; c++) {
        const address = `${encodeCol(decoded.s.c + c)}${decoded.s.r + r + 1}`
        const merged = overrides.get(address)
        let value = merged !== undefined ? merged : cellValue(sheet, address)
        // 纵向合并的首格：标注覆盖行数，让 AI 据此确定 periods
        const rowSpan = topSpans.get(address)
        if (rowSpan && value !== '') value = `${value}（纵向覆盖${rowSpan}行）`
        rowHasContent = rowHasContent || value !== ''
        cells.push(value)
      }
      if (rowHasContent) lines.push(cells.join('\t'))
    }
    if (lines.length === 0) continue
    result.push({
      name: sheetName,
      rows,
      cols,
      text: lines.join('\n'),
    })
  }
  return result
}
