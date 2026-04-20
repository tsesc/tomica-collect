import { useEffect, useState, useCallback, useMemo } from 'react'
import type { CollectionItem } from '../lib/types'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useCollection() {
  const { user } = useAuth()
  const [items, setItems] = useState<CollectionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCollection = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error: err } = await supabase.from('user_collection').select('*, catalog:tomica_catalog(*)').eq('user_id', user.id).order('created_at', { ascending: false })
    if (err) { setError(err.message) } else { setItems(data as CollectionItem[]) }
    setLoading(false)
  }, [user])

  useEffect(() => { fetchCollection() }, [fetchCollection])

  async function addToCollection(catalogId: string, opts?: { photo_url?: string; condition?: string; has_box?: boolean; notes?: string; acquired_date?: string }) {
    if (!user) throw new Error('Not authenticated')
    const { data, error: err } = await supabase.from('user_collection').insert({ user_id: user.id, catalog_id: catalogId, ...opts }).select().single()
    if (err) throw err
    await fetchCollection()
    return data
  }

  async function removeFromCollection(id: string) {
    const { error: err } = await supabase.from('user_collection').delete().eq('id', id)
    if (err) throw err
    await fetchCollection()
  }

  async function updateItem(id: string, updates: Partial<CollectionItem>) {
    const { error: err } = await supabase.from('user_collection').update(updates).eq('id', id)
    if (err) throw err
    await fetchCollection()
  }

  const collectedIds = useMemo(() => new Set(items.map((i) => i.catalog_id)), [items])

  return { items, loading, error, addToCollection, removeFromCollection, updateItem, collectedIds, refetch: fetchCollection }
}
