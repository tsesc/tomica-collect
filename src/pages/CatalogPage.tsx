import { useState } from 'react'
import { useCatalog } from '../hooks/useCatalog'
import { useCollection } from '../hooks/useCollection'
import { CatalogCard } from '../components/CatalogCard'
import { FilterSidebar } from '../components/FilterSidebar'
import type { Series, VehicleType } from '../lib/types'

export function CatalogPage() {
  const [series, setSeries] = useState<Series | null>(null)
  const [manufacturer, setManufacturer] = useState<string | null>(null)
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null)
  const [search, setSearch] = useState('')
  const [collectionFilter, setCollectionFilter] = useState<'all' | 'collected' | 'missing'>('all')

  const { items, loading } = useCatalog({ series: series ?? undefined, manufacturer: manufacturer ?? undefined, vehicle_type: vehicleType ?? undefined, search: search || undefined })
  const { collectedIds } = useCollection()

  const filtered = items.filter((item) => {
    if (collectionFilter === 'collected') return collectedIds.has(item.id)
    if (collectionFilter === 'missing') return !collectedIds.has(item.id)
    return true
  })

  const filterGroups = [
    { label: '系列', options: [{ value: 'regular', label: '常規' }, { value: 'premium', label: 'Premium' }, { value: 'limited_vintage', label: 'TLV' }, { value: 'dream', label: 'Dream' }], selected: series, onSelect: (v: string | null) => setSeries(v as Series | null) },
    { label: '收藏狀態', options: [{ value: 'all', label: '全部' }, { value: 'collected', label: '已收藏' }, { value: 'missing', label: '未收藏' }], selected: collectionFilter, onSelect: (v: string | null) => setCollectionFilter((v ?? 'all') as 'all' | 'collected' | 'missing') },
    { label: '製造商', options: ['Toyota', 'Nissan', 'Honda', 'BMW', 'Porsche', 'Suzuki'].map((m) => ({ value: m, label: m })), selected: manufacturer, onSelect: setManufacturer },
    { label: '車型', options: [{ value: 'sedan', label: '轎車' }, { value: 'suv', label: 'SUV' }, { value: 'sports', label: '跑車' }, { value: 'truck', label: '卡車' }, { value: 'bus', label: '巴士' }, { value: 'emergency', label: '緊急車輛' }, { value: 'construction', label: '工程車' }], selected: vehicleType, onSelect: (v: string | null) => setVehicleType(v as VehicleType | null) },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">
      <div className="md:hidden mb-4">
        <input type="text" placeholder="搜尋型號、車名..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-full bg-surface-container-low text-on-surface placeholder-on-surface-variant text-sm outline-none" />
      </div>
      <div className="flex gap-6">
        <div className="hidden md:block"><FilterSidebar groups={filterGroups} /></div>
        <div className="flex-1">
          {loading ? <div className="text-center py-12 text-on-surface-variant text-sm">載入中...</div> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filtered.map((item) => <CatalogCard key={item.id} item={item} isCollected={collectedIds.has(item.id)} />)}
            </div>
          )}
          {!loading && filtered.length === 0 && <p className="text-center py-12 text-on-surface-variant text-sm">沒有找到符合條件的車種</p>}
        </div>
      </div>
    </div>
  )
}
