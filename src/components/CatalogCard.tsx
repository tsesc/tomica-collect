import type { CatalogItem } from '../lib/types'

interface Props {
  item: CatalogItem
  isCollected: boolean
  onClick?: () => void
}

export function CatalogCard({ item, isCollected, onClick }: Props) {
  return (
    <div onClick={onClick} className={`rounded-2xl overflow-hidden cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-md relative ${isCollected ? 'bg-white' : 'bg-white opacity-60'}`}>
      {isCollected && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-success text-white rounded-full flex items-center justify-center text-xs font-bold z-10 shadow">✓</div>
      )}
      <div className="aspect-square bg-surface-container-low flex items-center justify-center">
        {item.image_url ? <img src={item.image_url} alt={item.car_name} className="w-full h-full object-contain p-2" /> : <span className="text-4xl">🚗</span>}
      </div>
      <div className="p-2">
        <div className="text-xs font-bold text-primary font-display">{item.model_number}</div>
        <div className="text-sm font-semibold truncate text-on-surface">{item.car_name}</div>
      </div>
    </div>
  )
}
