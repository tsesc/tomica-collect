import { motion, useReducedMotion } from 'framer-motion'
import type { CatalogItem } from '../../lib/types'
import { getItemCode } from '../../lib/types'
import { translateCarName } from '../../lib/translate'
import type { CaseTheme, TileSize } from '../../hooks/useCollectionLayout'
import { CASE_THEMES } from './caseThemes'

interface Props {
  item: CatalogItem
  size: TileSize
  theme: CaseTheme
  editMode: boolean
  /** This tile is the origin of an active drag — render as a recessed empty slot. */
  isDragSource: boolean
  onOpen: () => void
  onCycleSize: () => void
  onRemove: () => void
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
}

const SPAN: Record<TileSize, string> = {
  s: '',
  m: 'col-span-2',
  l: 'col-span-2 row-span-2',
}

const SIZE_LABEL: Record<TileSize, string> = { s: '小格', m: '寬格', l: '大格' }

/** Framed compartment + label plate, shared between the grid tile and the drag ghost. */
export function TileFace({
  item,
  size,
  theme,
  lifted = false,
}: {
  item: CatalogItem
  size: TileSize
  theme: CaseTheme
  lifted?: boolean
}) {
  const spec = CASE_THEMES[theme]
  const code = getItemCode(item)
  const { displayName, manufacturer } = translateCarName(item.car_name, item.manufacturer)
  const big = size === 'l'

  return (
    <div className={`w-full h-full rounded-2xl overflow-hidden ${spec.framePad} ${spec.frame}`} style={spec.frameStyle}>
      <div className="w-full h-full flex flex-col rounded-[11px] overflow-hidden">
        {/* Compartment: the car sits IN the case, on its ledge */}
        <div className="relative flex-1 min-h-0" style={spec.compartmentStyle}>
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.car_name}
              loading="lazy"
              referrerPolicy="no-referrer"
              draggable={false}
              className={`absolute inset-0 w-full h-full object-contain select-none transition-transform duration-300 ${
                big ? 'p-4' : 'p-2'
              } ${lifted ? '' : 'group-hover:scale-[1.05]'}`}
              style={{ filter: lifted ? spec.carShadowLifted : spec.carShadow }}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-45">
              <span className={big ? 'text-4xl' : 'text-2xl'}>🚗</span>
              <span className={`text-[9px] tracking-wide ${spec.plateSub}`}>NO IMAGE</span>
            </div>
          )}
          {/* Shelf ledge */}
          <div className={`absolute inset-x-0 bottom-0 h-5 ${spec.ledge}`} />
          {/* Material overlay (e.g. acrylic glare) */}
          {spec.overlay && <div className={spec.overlay} style={spec.overlayStyle} />}
        </div>

        {/* Label plate */}
        <div className={`shrink-0 px-2 ${big ? 'py-2' : 'py-1.5'} ${spec.plate}`}>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className={`font-bold font-mono tracking-tight shrink-0 ${big ? 'text-xs' : 'text-[10px]'} ${spec.plateCode}`}>
              {code}
            </span>
            <span className={`font-medium truncate ${big ? 'text-sm' : 'text-[11px]'} ${spec.plateName}`}>{displayName}</span>
          </div>
          {size !== 's' && manufacturer && (
            <div className={`text-[10px] truncate mt-0.5 ${spec.plateSub}`}>{manufacturer}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ShowcaseTile({ item, size, theme, editMode, isDragSource, onOpen, onCycleSize, onRemove, onPointerDown }: Props) {
  const reduceMotion = useReducedMotion()
  const spec = CASE_THEMES[theme]

  return (
    <motion.div
      layout
      data-tile-id={item.id}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
      className={`group relative min-h-0 ${SPAN[size]} ${editMode ? 'touch-none cursor-grab' : 'cursor-pointer'}`}
      style={{ willChange: 'transform' }}
      whileHover={editMode || reduceMotion || isDragSource ? undefined : { y: -4, scale: 1.015 }}
      onPointerDown={onPointerDown}
      onClick={() => {
        if (!editMode) onOpen()
      }}
      role={editMode ? undefined : 'button'}
      aria-label={editMode ? `${item.car_name}（拖曳換位）` : `查看 ${item.car_name}`}
    >
      {isDragSource ? (
        /* Recessed empty slot left behind while the car is picked up */
        <div className={`w-full h-full rounded-2xl border-2 border-dashed shadow-[inset_0_2px_8px_rgba(0,0,0,0.12)] ${spec.slot}`} />
      ) : (
        <div className="w-full h-full transition-shadow duration-300 rounded-2xl shadow-[0_1px_2px_rgba(39,24,22,0.06),0_4px_12px_-6px_rgba(39,24,22,0.12)] group-hover:shadow-[0_2px_4px_rgba(39,24,22,0.08),0_12px_24px_-8px_rgba(39,24,22,0.22)]">
          <TileFace item={item} size={size} theme={theme} />
        </div>
      )}

      {/* Edit-mode controls */}
      {editMode && !isDragSource && (
        <>
          <motion.button
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onCycleSize()
            }}
            aria-label={`切換格子大小（目前：${SIZE_LABEL[size]}）`}
            className="absolute bottom-1.5 right-1.5 z-10 h-7 min-w-7 px-1.5 rounded-full bg-on-surface/80 text-white backdrop-blur flex items-center justify-center gap-0.5 shadow-md active:scale-90 transition-transform"
          >
            <span className="material-symbols-outlined text-[15px]">aspect_ratio</span>
            <span className="text-[10px] font-bold">{size.toUpperCase()}</span>
          </motion.button>
          <motion.button
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            aria-label={`把 ${item.car_name} 移出收藏`}
            className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-white/95 text-on-surface-variant ring-1 ring-outline-variant/60 flex items-center justify-center shadow-sm active:scale-90 transition-transform hover:text-error hover:ring-error/40"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </motion.button>
        </>
      )}
    </motion.div>
  )
}
