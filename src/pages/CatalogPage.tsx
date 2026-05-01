import { useState, useMemo, useCallback, useRef } from 'react'
import { useCatalog } from '../hooks/useCatalog'
import type { NumberRange, SourceFilter } from '../hooks/useCatalog'
import { useCollection } from '../hooks/useCollection'
import { useAuth } from '../hooks/useAuth'
import { CatalogCard } from '../components/CatalogCard'
import { CarDetailModal } from '../components/CarDetailModal'
import { SubmitCatalogModal } from '../components/SubmitCatalogModal'
import type { CatalogItem, Series } from '../lib/types'

const SERIES_TABS: { value: Series; label: string }[] = [
  { value: 'regular', label: '常規' },
  { value: 'fandom', label: 'Fandom' },
  { value: 'limited_vintage', label: 'TLV' },
  { value: 'premium', label: 'Premium' },
  { value: 'premium_unlimited', label: 'Unlimited' },
  { value: 'dream', label: 'Dream' },
  { value: 'disney', label: 'Disney' },
  { value: 'cars', label: 'Cars' },
  { value: 'giftset', label: '禮盒' },
  { value: 'town', label: 'Town' },
]

const NUMBER_RANGES: { value: NumberRange | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
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

// Generate year options from 1970 to current year
const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1970 + 1 }, (_, i) => CURRENT_YEAR - i)

// Decade quick picks
const DECADES = [2020, 2010, 2000, 1990, 1980, 1970]

const VEHICLE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'car', label: '轎車' },
  { value: 'emergency', label: '緊急' },
  { value: 'truck', label: '卡車' },
  { value: 'bus', label: '巴士' },
  { value: 'construction', label: '工程' },
  { value: 'motorcycle', label: '機車' },
  { value: 'train', label: '列車' },
  { value: 'fantasy', label: '造型' },
]

const COLOR_OPTIONS: { value: string; label: string; hex: string }[] = [
  { value: 'red', label: '紅', hex: '#DC2626' },
  { value: 'blue', label: '藍', hex: '#2563EB' },
  { value: 'white', label: '白', hex: '#F9FAFB' },
  { value: 'black', label: '黑', hex: '#1F2937' },
  { value: 'silver', label: '銀', hex: '#9CA3AF' },
  { value: 'yellow', label: '黃', hex: '#EAB308' },
  { value: 'green', label: '綠', hex: '#16A34A' },
  { value: 'orange', label: '橙', hex: '#EA580C' },
]

export function CatalogPage() {
  const [series, setSeries] = useState<Series>('regular')
  const [numberRange, setNumberRange] = useState<NumberRange | 'all'>('all')
  const [source, setSource] = useState<SourceFilter>('all')
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>('all')
  const [year, setYear] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [vehicleCategory, setVehicleCategory] = useState<string | null>(null)
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [submitOpen, setSubmitOpen] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState<CatalogItem | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const isRegular = series === 'regular'
  const isNumbered = series === 'regular' || series === 'fandom'
  const { items, loading } = useCatalog({
    series,
    numberRange: (!isNumbered || numberRange === 'all') ? undefined : numberRange,
    source: (isRegular && source !== 'all') ? source : undefined,
    year: year ?? undefined,
    search: debouncedSearch || undefined,
    vehicleCategory: vehicleCategory ?? undefined,
    primaryColors: selectedColors.length > 0 ? selectedColors : undefined,
  })
  const { user } = useAuth()
  const { collectedIds, addToCollection, removeFromCollection, items: collectionItems } = useCollection()

  const handleSearch = (value: string) => {
    setSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300)
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
      {/* Series tabs */}
      <div className="overflow-x-auto overflow-y-hidden scrollbar-hide mb-3 border-b border-outline-variant/20">
        <div className="flex gap-1 min-w-max">
          {SERIES_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={(e) => {
                setSeries(tab.value as Series)
                setYear(null)
                e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
              }}
              className={`px-4 py-2 text-sm font-semibold transition-all border-b-2 -mb-px whitespace-nowrap
                ${series === tab.value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="搜尋車名、品牌、顏色、車型 (例: 紅色 豐田、tesla、跑車)"
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

      {/* Number range tabs — only for numbered series (regular / fandom) */}
      {isNumbered && (
        <div className="mb-3 overflow-x-auto overflow-y-hidden scrollbar-hide">
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
                {r.value === 'all' ? r.label : `No.${r.label}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter chips row */}
      <div className="mb-3 overflow-x-auto overflow-y-hidden scrollbar-hide">
        <div className="flex gap-3 min-w-max items-center">
          {/* Year filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-on-surface-variant font-medium mr-0.5">年份</span>
            <select
              value={year ?? ''}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border appearance-none cursor-pointer pr-6 bg-no-repeat bg-[right_6px_center] bg-[length:12px]
                ${year
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-white text-on-surface-variant border-outline-variant/20'
                }`}
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235b403d' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")` }}
            >
              <option value="">不限</option>
              {DECADES.map((d) => (
                <option key={d} value={d}>{d}年代</option>
              ))}
              <option disabled>──────</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {year && (
              <button onClick={() => setYear(null)} className="text-on-surface-variant/50 hover:text-on-surface text-xs">✕</button>
            )}
          </div>

          <div className="w-px h-5 bg-outline-variant/30" />

          {/* Source filter — only for regular */}
          {isRegular && (
            <>
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
            </>
          )}

          {/* Collection filter — only when logged in */}
          {user && (
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
          )}
        </div>
      </div>

      {/* Attribute filter chips */}
      <div className="mb-3 overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 min-w-max items-center">
          {/* Vehicle category */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-on-surface-variant font-medium mr-0.5">車型</span>
            {VEHICLE_CATEGORIES.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setVehicleCategory(vehicleCategory === opt.value ? null : opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
                  ${vehicleCategory === opt.value
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'bg-white text-on-surface-variant border border-outline-variant/20 hover:bg-surface-container-low'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-outline-variant/30" />

          {/* Color filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-on-surface-variant font-medium mr-0.5">顏色</span>
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedColors((prev) =>
                  prev.includes(opt.value) ? prev.filter((c) => c !== opt.value) : [...prev, opt.value]
                )}
                className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center
                  ${selectedColors.includes(opt.value) ? 'border-primary scale-110' : 'border-outline-variant/30'}`}
                style={{ backgroundColor: opt.hex }}
                title={opt.label}
              >
                {selectedColors.includes(opt.value) && (
                  <span className={`text-[10px] font-bold ${opt.value === 'white' || opt.value === 'yellow' ? 'text-on-surface' : 'text-white'}`}>✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between mb-3 px-1 gap-3">
        <div className="text-xs text-on-surface-variant truncate">
          {numberRange !== 'all' && isRegular && `No.${numberRange.split('-')[0]}–${numberRange.split('-')[1]}`}
          {numberRange !== 'all' && isRegular && (search || year) && ' · '}
          {search && '搜尋結果'}
          {!search && year && `${year} 年`}
          {!search && !year && numberRange === 'all' && '全部'}
          <span className="mx-1.5 text-outline-variant">·</span>
          <span className="font-semibold text-on-surface">{totalCount}</span> 款
          {user && collectedCount > 0 && (
            <>
              <span className="mx-1.5 text-outline-variant">·</span>
              <span className="text-success font-semibold">{collectedCount}</span> 已收藏
            </>
          )}
        </div>
        {user && (
          <button
            onClick={() => setSubmitOpen(true)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 transition-all whitespace-nowrap"
          >
            + 貢獻
          </button>
        )}
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
        <div className="text-center py-16 px-6 space-y-3">
          <div className="text-4xl">🔍</div>
          <p className="text-sm text-on-surface-variant">沒有找到符合條件的車種</p>
          {user && (
            <button
              onClick={() => setSubmitOpen(true)}
              className="mx-auto px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm"
            >
              + 找不到？貢獻一筆
            </button>
          )}
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

      {/* Submit modal */}
      {submitOpen && (
        <SubmitCatalogModal
          prefill={{
            series: search ? series : series,
            car_name: search,
            primary_color: selectedColors[0],
            vehicle_category: vehicleCategory ?? undefined,
          }}
          onClose={() => setSubmitOpen(false)}
          onSuccess={(item) => setJustSubmitted(item)}
        />
      )}

      {/* Toast on success — auto-show detail */}
      {justSubmitted && (
        <CarDetailModal
          item={justSubmitted}
          isCollected={collectedIds.has(justSubmitted.id)}
          onClose={() => { setJustSubmitted(null); window.location.reload() }}
          onToggleCollection={user ? handleToggleCollection : undefined}
          collectionLoading={actionLoading}
        />
      )}
    </div>
  )
}
