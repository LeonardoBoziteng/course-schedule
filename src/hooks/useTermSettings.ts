import { useSyncExternalStore } from 'react'
import { termSettings } from '../lib/termSettings'
import type { TermSettings } from '../lib/termSettings'

/** 订阅学期设置，变化时自动重渲染 */
export function useTermSettings(): TermSettings {
  return useSyncExternalStore(
    termSettings.subscribe,
    termSettings.getSnapshot,
    termSettings.getSnapshot,
  )
}
