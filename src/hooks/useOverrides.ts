import { useSyncExternalStore } from 'react'
import { overrideStore } from '../lib/overrideStore'
import type { WeekOverride } from '../lib/overrideStore'

/** 订阅“每周位置例外”，变化时自动重渲染 */
export function useOverrides(): WeekOverride[] {
  return useSyncExternalStore(
    overrideStore.subscribe,
    overrideStore.getSnapshot,
    overrideStore.getSnapshot,
  )
}
