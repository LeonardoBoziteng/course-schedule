import { useSyncExternalStore } from 'react'
import { courseStore } from '../lib/courseStore'
import type { Course } from '../types'

/** 订阅课程数据，数据变化时自动触发重渲染 */
export function useCourses(): Course[] {
  return useSyncExternalStore(
    courseStore.subscribe,
    courseStore.getSnapshot,
    courseStore.getSnapshot,
  )
}
