import type { CatalogItem } from '../lib/types'
import { getItemCode } from '../lib/types'
import { translateCarName } from '../lib/translate'

interface Props {
  item: CatalogItem
  isCollected: boolean
  onClick?: () => void
}

export function CatalogCard({ item, isCollected, onClick }: Props) {
  const isHistorical = item.source === 'community'
  const isUserSubmitted = item.source === 'user' || item.submission_status === 'user'
  const code = getItemCode(item)
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

      {/* User-submitted badge */}
      {isUserSubmitted && (
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-tertiary/95 text-white rounded text-[8px] font-bold z-10 shadow-sm tracking-wide">玩家</div>
      )}

      {/* Image */}
      <div className="aspect-[4/3] bg-surface-container-low flex items-center justify-center overflow-hidden">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.car_name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain p-1.5 group-hover:scale-105 transition-transform"
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
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-primary font-display font-mono tracking-tight">{code}</span>
          {item.source === 'official' && item.series === 'regular' && (
            <span className="text-[8px] px-1 py-px bg-primary/10 text-primary rounded font-medium">現行</span>
          )}
        </div>
        <div className="text-xs font-medium leading-tight text-on-surface line-clamp-2">{displayName}</div>
        <div className="text-[10px] text-on-surface-variant truncate">
          {manufacturer}{manufacturer && item.release_start ? ' · ' : ''}{item.release_start?.slice(0, 4) ?? ''}
          {item.release_end ? `–${item.release_end.slice(0, 4)}` : item.release_start ? '–' : ''}
        </div>
      </div>
    </div>
  )
}
