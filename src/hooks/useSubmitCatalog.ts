import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CatalogItem, Series } from '../lib/types'

export interface SubmitPayload {
  car_name: string
  series: Series
  model_number?: string
  manufacturer?: string
  primary_color?: string
  secondary_color?: string
  vehicle_category?: string
  body_style?: string
  release_year?: number
  notes?: string
  image_base64: string
}

export interface SubmitResult {
  item: CatalogItem
  duplicate: boolean
}

export function useSubmitCatalog() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(payload: SubmitPayload): Promise<SubmitResult | null> {
    setError(null)
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('請先登入')
        return null
      }
      const resp = await fetch('/api/submit-catalog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      })
      const data = await resp.json() as { item?: CatalogItem; duplicate?: boolean; error?: string }
      if (!resp.ok || !data.item) {
        setError(data.error ?? '建立失敗')
        return null
      }
      return { item: data.item, duplicate: !!data.duplicate }
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤')
      return null
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting, error, clearError: () => setError(null) }
}
