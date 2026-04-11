import { useState } from 'react'
import { useCollection } from '../hooks/useCollection'
import { useCatalog } from '../hooks/useCatalog'
import { StatsRow } from '../components/StatsRow'
import { CatalogCard } from '../components/CatalogCard'

export function CollectionPage() {
  const { items: collection, collectedIds } = useCollection()
  const { items: catalog } = useCatalog()
  const [tab, setTab] = useState<'collected' | 'missing'>('collected')

  const collected = collection.length
  const total = catalog.length
  const missing = total - collected
  const missingItems = catalog.filter((c) => !collectedIds.has(c.id))

  return (
    <div className="max-w-4xl mx-auto px-4 py-4 space-y-5">
      <h2 className="font-display font-bold text-xl">我的收藏</h2>
      <StatsRow collected={collected} missing={missing} total={total} />
      <div className="flex gap-2">
        {(['collected', 'missing'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-sm font-display font-semibold transition-all ${tab === t ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'}`}>
            {t === 'collected' ? `已收藏 (${collected})` : `缺少清單 (${missing})`}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {tab === 'collected'
          ? collection.map((item) => item.catalog ? <CatalogCard key={item.id} item={item.catalog} isCollected={true} /> : null)
          : missingItems.map((item) => <CatalogCard key={item.id} item={item} isCollected={false} />)}
      </div>
      {tab === 'collected' && collection.length === 0 && <p className="text-center text-on-surface-variant text-sm py-8">還沒有收藏，去掃描一台吧！</p>}
    </div>
  )
}
