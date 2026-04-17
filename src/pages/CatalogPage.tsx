import { useState, useMemo, useCallback } from 'react'
import { useCatalog } from '../hooks/useCatalog'
import type { NumberRange, SourceFilter } from '../hooks/useCatalog'
import { useCollection } from '../hooks/useCollection'
import { useAuth } from '../hooks/useAuth'
import { CatalogCard } from '../components/CatalogCard'
import { CarDetailModal } from '../components/CarDetailModal'
import type { CatalogItem } from '../lib/types'

const NUMBER_RANGES: { value: NumberRange; label: string }[] = [
  { value: '1-30', label: '1–30' },
  { value: '31-60', label: '31–60' },
  { value: '61-90', label: '61–90' },
  { value: '91-120', label: '91–120' },
  { value: '121-150', label: '121–150' },
]

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'official', label: '現行' },
  { value: 'community', label: '歷代' },
]

type CollectionFilter = 'all' | 'collected' | 'missing'

const COLLECTION_OPTIONS: { value: CollectionFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'collected', label: '已收藏' },
  { value: 'missing', label: '未收藏' },
]

export function CatalogPage() {
  const [numberRange, setNumberRange] = useState<NumberRange>('1-30')
  const [source, setSource] = useState<SourceFilter>('all')
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const { items, loading } = useCatalog({
    numberRange: search ? undefined : numberRange,
    source: source !== 'all' ? source : undefined,
    search: debouncedSearch || undefined,
  })
  const { user } = useAuth()
  const { collectedIds, addToCollection, removeFromCollection, items: collectionItems } = useCollection()

  const handleSearch = (value: string) => {
    setSearch(value)
    clearTimeout((handleSearch as { timer?: ReturnType<typeof setTimeout> }).timer)
    ;(handleSearch as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(() => {
      setDebouncedSearch(value)
    }, 300)
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (collectionFilter === 'collected') return collectedIds.has(item.id)
      if (collectionFilter === 'missing') return !collectedIds.has(item.id)
      return true
    })
  }, [items, collectionFilter, collectedIds])

  const totalCount = filtered.length
  const collectedCount = filtered.filter((item) => collectedIds.has(item.id)).length

  const handleToggleCollection = useCallback(async (item: CatalogItem) => {
    if (!user) return
    setActionLoading(true)
    try {
      if (collectedIds.has(item.id)) {
        const entry = collectionItems.find((c) => c.catalog_id === item.id)
        if (entry) await removeFromCollection(entry.id)
      } else {
        await addToCollection(item.id)
      }
    } catch { /* error handled by hook */ }
    setActionLoading(false)
  }, [user, collectedIds, collectionItems, addToCollection, removeFromCollection])

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 py-3 md:py-5">
      {/* Search bar */}
      <div className="mb-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜尋車名、型號 (例: スカイライン、No.1)"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white text-on-surface placeholder-on-surface-variant/50 text-sm outline-none border border-outline-variant/30 focus:border-primary focus:ring-1 focus:ring-primary/20 shadow-sm"
          />
          {search && (
            <button onClick={() => { setSearch(''); setDebouncedSearch('') }} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Number range tabs */}
      {!search && (
        <div className="mb-3 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1.5 min-w-max">
            {NUMBER_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setNumberRange(r.value)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap
                  ${numberRange === r.value
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white text-on-surface-variant border border-outline-variant/30 hover:bg-surface-container-low'
                  }`}
              >
                No.{r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter chips row */}
      <div className="mb-3 overflow-x-auto scrollbar-hide">
        <div className="flex gap-4 min-w-max items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-on-surface-variant font-medium mr-0.5">來源</span>
            {SOURCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSource(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
                  ${source === opt.value
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'bg-white text-on-surface-variant border border-outline-variant/20 hover:bg-surface-container-low'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-outline-variant/30" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-on-surface-variant font-medium mr-0.5">收藏</span>
            {COLLECTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCollectionFilter(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
                  ${collectionFilter === opt.value
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'bg-white text-on-surface-variant border border-outline-variant/20 hover:bg-surface-container-low'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="text-xs text-on-surface-variant">
          {search ? '搜尋結果' : `No.${numberRange.split('-')[0]}–${numberRange.split('-')[1]}`}
          <span className="mx-1.5 text-outline-variant">·</span>
          <span className="font-semibold text-on-surface">{totalCount}</span> 款
          {collectedCount > 0 && (
            <>
              <span className="mx-1.5 text-outline-variant">·</span>
              <span className="text-success font-semibold">{collectedCount}</span> 已收藏
            </>
          )}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 md:gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-white shadow-sm overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-surface-container-low" />
              <div className="p-2 space-y-1.5">
                <div className="h-3 bg-surface-container-low rounded w-12" />
                <div className="h-3 bg-surface-container-low rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 md:gap-3">
          {filtered.map((item) => (
            <CatalogCard
              key={item.id}
              item={item}
              isCollected={collectedIds.has(item.id)}
              onClick={() => setSelectedItem(item)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-sm text-on-surface-variant">沒有找到符合條件的車種</p>
        </div>
      )}

      {/* Detail modal */}
      {selectedItem && (
        <CarDetailModal
          item={selectedItem}
          isCollected={collectedIds.has(selectedItem.id)}
          onClose={() => setSelectedItem(null)}
          onToggleCollection={user ? handleToggleCollection : undefined}
          collectionLoading={actionLoading}
        />
      )}
    </div>
  )
}
