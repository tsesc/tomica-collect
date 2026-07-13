import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useCollection } from '../hooks/useCollection'
import { useCollectionLayout } from '../hooks/useCollectionLayout'
import { ShowcaseGrid, type ShowcaseEntry } from '../components/showcase/ShowcaseGrid'
import { CASE_THEMES, THEME_ORDER } from '../components/showcase/caseThemes'
import { CarDetailModal } from '../components/CarDetailModal'
import { getItemCode } from '../lib/types'
import { translateCarName } from '../lib/translate'

const SERIES_LABEL: Record<string, string> = {
  regular: '常規',
  tlv: 'TLV',
  limited_vintage: 'TLV',
  premium: 'Premium',
  unlimited: 'Unlimited',
  dream: 'Dream',
  cars: 'Cars',
  disney: 'Disney',
}

export function CollectionPage() {
  const { items, loading, removeFromCollection } = useCollection()
  const { arrange, sizeOf, cycleSize, commitOrder, theme, setTheme } = useCollectionLayout()
  const [editMode, setEditMode] = useState(false)
  const [search, setSearch] = useState('')
  const [seriesFilter, setSeriesFilter] = useState<string>('all')
  const [selected, setSelected] = useState<ShowcaseEntry | null>(null)

  const entries = useMemo<ShowcaseEntry[]>(() => {
    const withCatalog = items.filter((i) => i.catalog)
    const arranged = arrange(withCatalog)
    return arranged.map((i) => ({ collectionId: i.id, item: i.catalog! }))
  }, [items, arrange])

  const seriesChips = useMemo(() => {
    const seen = new Map<string, number>()
    for (const e of entries) seen.set(e.item.series, (seen.get(e.item.series) ?? 0) + 1)
    return [...seen.entries()]
  }, [entries])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) => {
      if (seriesFilter !== 'all' && e.item.series !== seriesFilter) return false
      if (!q) return true
      const { displayName } = translateCarName(e.item.car_name, e.item.manufacturer)
      return (
        e.item.car_name.toLowerCase().includes(q) ||
        (e.item.car_name_zh_tw ?? '').toLowerCase().includes(q) ||
        displayName.toLowerCase().includes(q) ||
        getItemCode(e.item).toLowerCase().includes(q)
      )
    })
  }, [entries, search, seriesFilter])

  const canArrange = search.trim() === '' && seriesFilter === 'all'

  const handleRemove = (entry: ShowcaseEntry) => {
    const { displayName } = translateCarName(entry.item.car_name, entry.item.manufacturer)
    if (window.confirm(`把「${displayName}」移出收藏？連同狀態與筆記一併刪除。`)) {
      removeFromCollection(entry.collectionId)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 pt-4 pb-28">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <h1 className="font-display font-extrabold text-2xl tracking-tight text-on-surface">我的收藏</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {loading ? '整理櫃子中…' : `${items.length} 台入櫃`}
          </p>
        </div>
        {entries.length > 0 && (
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`flex items-center gap-1.5 px-4 h-9 rounded-full text-sm font-semibold transition-all active:scale-95 ${
              editMode
                ? 'bg-primary text-white shadow-md'
                : 'bg-white text-on-surface ring-1 ring-outline-variant/60 hover:ring-primary/40'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{editMode ? 'done' : 'shelves'}</span>
            {editMode ? '完成' : '整理'}
          </button>
        )}
      </div>

      {/* Search + series filter */}
      {entries.length > 0 && (
        <div className="space-y-2 mb-4">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-[20px]">
              search
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋車名或編號"
              className="w-full h-10 pl-10 pr-4 rounded-full bg-white ring-1 ring-outline-variant/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-on-surface-variant/50"
            />
          </div>
          {seriesChips.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-3 px-3">
              <Chip active={seriesFilter === 'all'} onClick={() => setSeriesFilter('all')}>
                全部 {entries.length}
              </Chip>
              {seriesChips.map(([series, count]) => (
                <Chip key={series} active={seriesFilter === series} onClick={() => setSeriesFilter(series)}>
                  {SERIES_LABEL[series] ?? series} {count}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Showcase */}
      {loading ? (
        <SkeletonCase />
      ) : entries.length === 0 ? (
        <EmptyCase />
      ) : visible.length === 0 ? (
        <div className="py-16 text-center text-on-surface-variant">
          <p className="text-sm">櫃子裡找不到符合的車</p>
          <button onClick={() => { setSearch(''); setSeriesFilter('all') }} className="mt-2 text-sm text-primary font-semibold">
            清除篩選
          </button>
        </div>
      ) : (
        <>
          {/* Case material picker */}
          <AnimatePresence>
            {editMode && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-3 px-3">
                  <span className="shrink-0 text-xs font-semibold text-on-surface-variant">櫃子材質</span>
                  {THEME_ORDER.map((t) => {
                    const spec = CASE_THEMES[t]
                    const active = theme === t
                    return (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        aria-pressed={active}
                        className={`shrink-0 flex items-center gap-1.5 h-9 pl-1.5 pr-3 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                          active
                            ? 'bg-on-surface text-white shadow-md'
                            : 'bg-white text-on-surface-variant ring-1 ring-outline-variant/50'
                        }`}
                      >
                        <span className={`w-6 h-6 rounded-full ${spec.swatch}`} style={spec.swatchStyle} />
                        {spec.label}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={CASE_THEMES[theme].caseBody}>
            <ShowcaseGrid
              entries={visible}
              sizeOf={sizeOf}
              theme={theme}
              editMode={editMode}
              canArrange={canArrange}
              onEnterEdit={() => setEditMode(true)}
              onCommitOrder={commitOrder}
              onOpen={setSelected}
              onCycleSize={cycleSize}
              onRemove={handleRemove}
            />
          </div>
        </>
      )}

      {/* Edit-mode hint bar */}
      <AnimatePresence>
        {editMode && (
          <motion.div
            initial={{ y: 64, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 64, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="fixed bottom-20 inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
          >
            <div className="pointer-events-auto flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-full bg-on-surface/90 text-white backdrop-blur shadow-xl">
              <span className="text-xs">
                {canArrange ? '拖曳換位，點 S/M/L 換格子大小' : '篩選中 — 切回「全部」才能拖曳排序'}
              </span>
              <button
                onClick={() => setEditMode(false)}
                className="h-8 px-4 rounded-full bg-white text-on-surface text-xs font-bold active:scale-95 transition-transform"
              >
                完成
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail modal */}
      {selected && (
        <CarDetailModal
          item={selected.item}
          isCollected
          onClose={() => setSelected(null)}
          onToggleCollection={() => {
            handleRemove(selected)
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
        active ? 'bg-primary text-white shadow-sm' : 'bg-white text-on-surface-variant ring-1 ring-outline-variant/50'
      }`}
    >
      {children}
    </button>
  )
}

function SkeletonCase() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 auto-rows-[10.5rem] sm:auto-rows-[11rem] gap-2.5 md:gap-3">
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="rounded-2xl bg-surface-container-low animate-pulse"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  )
}

function EmptyCase() {
  return (
    <div className="py-12 flex flex-col items-center text-center">
      {/* An empty display case, waiting */}
      <div className="grid grid-cols-3 gap-2 w-56 mb-6" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 24 }}
            className="aspect-[4/3] rounded-xl border-2 border-dashed border-outline-variant/60 bg-surface-container-low/50"
          />
        ))}
      </div>
      <h2 className="font-display font-bold text-lg text-on-surface">收納盒還空著</h2>
      <p className="text-sm text-on-surface-variant mt-1 mb-5">收藏第一台車，開始佈置你的陳列櫃</p>
      <Link
        to="/catalog"
        className="h-10 px-6 rounded-full bg-primary text-white text-sm font-semibold flex items-center gap-1.5 shadow-md active:scale-95 transition-transform"
      >
        <span className="material-symbols-outlined text-[18px]">auto_stories</span>
        去圖鑑挑車
      </Link>
    </div>
  )
}
