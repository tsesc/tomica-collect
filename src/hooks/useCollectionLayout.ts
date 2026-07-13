import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export type TileSize = 's' | 'm' | 'l'
export type CaseTheme = 'classic' | 'wood' | 'acrylic' | 'velvet'

export interface CollectionLayout {
  order: string[] // catalog_id, display order (front → back of the case)
  sizes: Record<string, TileSize> // catalog_id → tile size, absent = 's'
  theme: CaseTheme // case material
}

const EMPTY: CollectionLayout = { order: [], sizes: {}, theme: 'classic' }
const SAVE_DEBOUNCE_MS = 800
const THEMES: CaseTheme[] = ['classic', 'wood', 'acrylic', 'velvet']

const storageKey = (userId: string) => `tomica:collection-layout:${userId}`

function sanitize(raw: unknown): CollectionLayout | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as Partial<CollectionLayout>
  if (!Array.isArray(candidate.order)) return null
  return {
    order: candidate.order.filter((id): id is string => typeof id === 'string'),
    sizes: candidate.sizes && typeof candidate.sizes === 'object' ? candidate.sizes : {},
    theme: THEMES.includes(candidate.theme as CaseTheme) ? (candidate.theme as CaseTheme) : 'classic',
  }
}

/**
 * Per-user showcase arrangement: display order, tile size and case material.
 * localStorage gives an instant first paint; user_settings.collection_layout
 * (own-row RLS) syncs the arrangement across devices.
 */
export function useCollectionLayout() {
  const { user } = useAuth()
  const userId = user?.id
  const [layout, setLayout] = useState<CollectionLayout>(EMPTY)
  // Synchronous mirror of the latest layout so rapid successive edits
  // (e.g. double-tapping the size chip) never work from a stale closure.
  const layoutRef = useRef(layout)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!userId) return
    try {
      const cached = sanitize(JSON.parse(localStorage.getItem(storageKey(userId)) ?? 'null'))
      if (cached) {
        layoutRef.current = cached
        setLayout(cached)
      }
    } catch {
      /* corrupt cache — DB copy below is authoritative anyway */
    }
    supabase
      .from('user_settings')
      .select('collection_layout')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => {
        const remote = sanitize(data?.collection_layout)
        if (remote) {
          layoutRef.current = remote
          setLayout(remote)
        }
      })
  }, [userId])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  const persist = useCallback(
    (next: CollectionLayout) => {
      layoutRef.current = next
      setLayout(next)
      if (!userId) return
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(next))
      } catch {
        /* storage full/blocked — DB sync below still covers it */
      }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        supabase
          .from('user_settings')
          .upsert({ user_id: userId, collection_layout: next }, { onConflict: 'user_id' })
          .then(({ error }) => {
            if (error) console.warn('collection_layout sync failed:', error.message)
          })
      }, SAVE_DEBOUNCE_MS)
    },
    [userId],
  )

  /** Order items by the saved arrangement; cars not yet in it lead the case. */
  const arrange = useCallback(
    <T extends { catalog_id: string }>(items: T[]): T[] => {
      const pos = new Map(layout.order.map((id, i) => [id, i]))
      const fresh: T[] = []
      const placed: T[] = []
      for (const item of items) (pos.has(item.catalog_id) ? placed : fresh).push(item)
      placed.sort((a, b) => pos.get(a.catalog_id)! - pos.get(b.catalog_id)!)
      return [...fresh, ...placed]
    },
    [layout.order],
  )

  const sizeOf = useCallback(
    (catalogId: string): TileSize => layout.sizes[catalogId] ?? 's',
    [layout.sizes],
  )

  /** s → m → l → s */
  const cycleSize = useCallback(
    (catalogId: string) => {
      const current = layoutRef.current
      const next: Record<TileSize, TileSize> = { s: 'm', m: 'l', l: 's' }
      persist({
        ...current,
        sizes: { ...current.sizes, [catalogId]: next[current.sizes[catalogId] ?? 's'] },
      })
    },
    [persist],
  )

  /** Commit the full visible order after a drag ends. */
  const commitOrder = useCallback(
    (catalogIds: string[]) => {
      persist({ ...layoutRef.current, order: catalogIds })
    },
    [persist],
  )

  const setTheme = useCallback(
    (theme: CaseTheme) => {
      persist({ ...layoutRef.current, theme })
    },
    [persist],
  )

  return { layout, theme: layout.theme, arrange, sizeOf, cycleSize, commitOrder, setTheme }
}
