import type { CatalogItem } from '../lib/types'
import { translateCarName } from '../lib/translate'

interface Props {
  item: CatalogItem
  isCollected: boolean
  onClick?: () => void
}

export function CatalogCard({ item, isCollected, onClick }: Props) {
  const isHistorical = item.source === 'community'
  const modelNum = item.model_number.replace('No.', '#')
  const { displayName, manufacturer } = translateCarName(item.car_name, item.manufacturer)

  return (
    <div
      onClick={onClick}
      className={`rounded-xl overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg relative group
        ${isCollected ? 'ring-2 ring-success bg-white shadow-sm' : 'bg-white shadow-sm'}
        ${isHistorical && !isCollected ? 'opacity-75' : ''}`}
    >
      {/* Collection badge */}
      {isCollected && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-success text-white rounded-full flex items-center justify-center text-[10px] font-bold z-10 shadow-sm">✓</div>
      )}

      {/* Source / variant badge */}
      {isHistorical && item.variant != null && (
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/60 text-white text-[10px] font-medium rounded z-10">
          第{item.variant}代
        </div>
      )}

      {/* Image */}
      <div className="aspect-[4/3] bg-surface-container-low flex items-center justify-center overflow-hidden">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.car_name}
            className="w-full h-full object-contain p-1.5 group-hover:scale-105 transition-transform"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-0.5 text-on-surface-variant/40">
            <span className="text-2xl">🚗</span>
            <span className="text-[9px]">NO IMAGE</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-primary font-display">{modelNum}</span>
          {item.source === 'official' && (
            <span className="text-[8px] px-1 py-px bg-primary/10 text-primary rounded font-medium">現行</span>
          )}
        </div>
        <div className="text-xs font-medium leading-tight text-on-surface line-clamp-2">{displayName}</div>
        {manufacturer && (
          <div className="text-[10px] text-on-surface-variant truncate">{manufacturer}</div>
        )}
      </div>
    </div>
  )
}
