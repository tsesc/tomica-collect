import { useEffect, useState } from 'react'
import type { CatalogItem, Series, VehicleType } from '../lib/types'
import { supabase } from '../lib/supabase'

interface Filters {
  series?: Series
  manufacturer?: string
  vehicle_type?: VehicleType
  search?: string
}

export function useCatalog(filters?: Filters) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      let query = supabase.from('tomica_catalog').select('*')
      if (filters?.series) query = query.eq('series', filters.series)
      if (filters?.manufacturer) query = query.eq('manufacturer', filters.manufacturer)
      if (filters?.vehicle_type) query = query.eq('vehicle_type', filters.vehicle_type)
      if (filters?.search) query = query.or(`car_name.ilike.%${filters.search}%,model_number.ilike.%${filters.search}%`)
      const { data, error: err } = await query.order('model_number')
      if (err) { setError(err.message) } else { setItems(data as CatalogItem[]) }
      setLoading(false)
    }
    fetch()
  }, [filters?.series, filters?.manufacturer, filters?.vehicle_type, filters?.search])

  return { items, loading, error }
}
