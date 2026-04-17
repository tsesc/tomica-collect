import { useEffect, useState } from 'react'
import type { CatalogItem } from '../lib/types'
import { supabase } from '../lib/supabase'

export type NumberRange = '1-30' | '31-60' | '61-90' | '91-120' | '121-150'
export type SourceFilter = 'all' | 'official' | 'community'

interface Filters {
  numberRange?: NumberRange
  source?: SourceFilter
  year?: number
  search?: string
}

/** Map range label → model_number patterns to match */
const RANGE_NUMBERS: Record<NumberRange, string[]> = {
  '1-30': Array.from({ length: 30 }, (_, i) => `No.${i + 1}`),
  '31-60': Array.from({ length: 30 }, (_, i) => `No.${i + 31}`),
  '61-90': Array.from({ length: 30 }, (_, i) => `No.${i + 61}`),
  '91-120': Array.from({ length: 30 }, (_, i) => `No.${i + 91}`),
  '121-150': Array.from({ length: 30 }, (_, i) => `No.${i + 121}`),
}

export function useCatalog(filters?: Filters) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      let query = supabase.from('tomica_catalog').select('*')

      if (filters?.source && filters.source !== 'all') {
        query = query.eq('source', filters.source)
      }

      if (filters?.numberRange) {
        const nums = RANGE_NUMBERS[filters.numberRange]
        query = query.in('model_number', nums)
      }

      if (filters?.year) {
        // release_start format is "YYYY-MM", filter items that were active in this year
        // active = release_start year <= filter year AND (release_end is null OR release_end year >= filter year)
        const yearStart = `${filters.year}-01`
        const yearEnd = `${filters.year}-12`
        query = query.lte('release_start', yearEnd)
        query = query.or(`release_end.is.null,release_end.gte.${yearStart}`)
      }

      if (filters?.search) {
        query = query.or(`car_name.ilike.%${filters.search}%,model_number.ilike.%${filters.search}%`)
      }

      const { data, error: err } = await query.order('model_number').order('variant', { ascending: true, nullsFirst: false })
      if (err) { setError(err.message) } else { setItems(data as CatalogItem[]) }
      setLoading(false)
    }
    fetch()
  }, [filters?.numberRange, filters?.source, filters?.year, filters?.search])

  return { items, loading, error }
}
