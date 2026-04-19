import { useEffect, useState, useMemo } from 'react'
import type { CatalogItem, Series } from '../lib/types'
import { supabase } from '../lib/supabase'
import { buildSearchIndex, matchesSearch } from '../lib/search'

export type NumberRange = '1-30' | '31-60' | '61-90' | '91-120' | '121-150'
export type SourceFilter = 'all' | 'official' | 'community'

interface Filters {
  series?: Series
  numberRange?: NumberRange
  source?: SourceFilter
  year?: number
  search?: string
  vehicleCategory?: string
  primaryColors?: string[]
  features?: string[]
}

const NUMBER_BOUNDS: Record<NumberRange, [number, number]> = {
  '1-30': [1, 30],
  '31-60': [31, 60],
  '61-90': [61, 90],
  '91-120': [91, 120],
  '121-150': [121, 150],
}

function parseModelNum(modelNumber: string): number {
  return parseInt(modelNumber.replace(/\D/g, ''), 10) || 0
}

function sortItems(data: CatalogItem[]): CatalogItem[] {
  return [...data].sort((a, b) => {
    const numA = parseModelNum(a.model_number)
    const numB = parseModelNum(b.model_number)
    if (numA !== numB) return numA - numB
    return (a.variant ?? 0) - (b.variant ?? 0)
  })
}

/** Indexed item: catalog item + pre-computed search text */
interface IndexedItem {
  item: CatalogItem
  searchText: string
}

export function useCatalog(filters?: Filters) {
  const [indexed, setIndexed] = useState<IndexedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load all items for a series once. Only series triggers a DB refetch.
  const series = filters?.series
  useEffect(() => {
    async function fetch() {
      setLoading(true)
      let query = supabase.from('tomica_catalog').select('*')
      if (series) query = query.eq('series', series)

      const { data, error: err } = await query
      if (err) {
        setError(err.message)
      } else {
        const sorted = sortItems(data as CatalogItem[])
        setIndexed(sorted.map(item => ({
          item,
          searchText: buildSearchIndex(item),
        })))
      }
      setLoading(false)
    }
    fetch()
  }, [series])

  // All filtering is client-side — instant, no DB round-trips
  const items = useMemo(() => {
    let result = indexed

    // Source filter
    if (filters?.source && filters.source !== 'all') {
      result = result.filter(({ item }) => item.source === filters.source)
    }

    // Number range filter (numeric comparison, not string matching)
    if (filters?.numberRange) {
      const [lo, hi] = NUMBER_BOUNDS[filters.numberRange]
      result = result.filter(({ item }) => {
        const n = parseModelNum(item.model_number)
        return n >= lo && n <= hi
      })
    }

    // Year filter
    if (filters?.year) {
      const yearStart = `${filters.year}-01`
      const yearEnd = `${filters.year}-12`
      result = result.filter(({ item }) => {
        if (!item.release_start || item.release_start > yearEnd) return false
        if (item.release_end && item.release_end < yearStart) return false
        return true
      })
    }

    // Attribute filters
    if (filters?.vehicleCategory) {
      result = result.filter(({ item }) => item.attributes?.vehicle_category === filters.vehicleCategory)
    }
    if (filters?.primaryColors && filters.primaryColors.length > 0) {
      result = result.filter(({ item }) => {
        const color = item.attributes?.primary_color
        return color ? filters.primaryColors!.includes(color) : false
      })
    }
    if (filters?.features && filters.features.length > 0) {
      result = result.filter(({ item }) => {
        const feats = item.attributes?.features ?? []
        return filters.features!.every(f => feats.includes(f))
      })
    }

    // Search — multi-token AND with multilingual synonym expansion
    if (filters?.search) {
      result = result.filter(({ searchText }) => matchesSearch(searchText, filters.search!))
    }

    return result.map(({ item }) => item)
  }, [indexed, filters?.source, filters?.numberRange, filters?.year, filters?.vehicleCategory, filters?.primaryColors, filters?.features, filters?.search])

  return { items, loading, error }
}
