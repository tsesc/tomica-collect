import { useEffect, useRef, useCallback, useState } from 'react'
import type { CatalogItem, VehicleAttributes } from '../lib/types'
import { getItemCode } from '../lib/types'
import { translateCarName } from '../lib/translate'
import { colorToZh, colorToHex, CATEGORY_ZH, BODY_STYLE_ZH, SIZE_ZH, ERA_ZH, WINDOW_ZH, FEATURE_ZH, SERIES_ZH } from '../lib/display'

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-low rounded-lg px-3 py-2">
      <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">{label}</div>
      <div className="font-medium text-on-surface">{children}</div>
    </div>
  )
}

function AttributeGrid({ attrs: a }: { attrs: VehicleAttributes }) {
  const feats = a.features ?? []
  return <>
    {a.vehicle_category && <Cell label="車型分類">{CATEGORY_ZH[a.vehicle_category] ?? a.vehicle_category}</Cell>}
    {a.body_style && <Cell label="車身型式">{BODY_STYLE_ZH[a.body_style] ?? a.body_style}</Cell>}
    {a.primary_color && (
      <Cell label="車色">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="w-5 h-5 rounded-full border border-outline-variant/30 inline-block shadow-sm" style={{ backgroundColor: colorToHex(a.primary_color) }} />
          <span>{colorToZh(a.primary_color)}</span>
          {a.secondary_color && (
            <>
              <span className="text-on-surface-variant/50 mx-0.5">/</span>
              <span className="w-5 h-5 rounded-full border border-outline-variant/30 inline-block shadow-sm" style={{ backgroundColor: colorToHex(a.secondary_color) }} />
              <span>{colorToZh(a.secondary_color)}</span>
            </>
          )}
        </div>
      </Cell>
    )}
    {a.wheel_count != null && <Cell label="輪子">{a.wheel_count} 輪</Cell>}
    {a.size_class && <Cell label="車身大小">{SIZE_ZH[a.size_class] ?? a.size_class}</Cell>}
    {a.era_style && <Cell label="年代風格">{ERA_ZH[a.era_style] ?? a.era_style}</Cell>}
    {a.window_style && <Cell label="車窗">{WINDOW_ZH[a.window_style] ?? a.window_style}</Cell>}
    {a.has_livery != null && <Cell label="塗裝">{a.has_livery ? '有塗裝' : '素色'}</Cell>}
    {feats.length > 0 && (
      <div className="bg-surface-container-low rounded-lg px-3 py-2 col-span-2">
        <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-1">特殊配件</div>
        <div className="flex flex-wrap gap-1.5">
          {feats.map((f) => (
            <span key={f} className="px-2.5 py-1 bg-primary/10 text-primary text-[11px] font-medium rounded-full">
              {FEATURE_ZH[f] ?? f}
            </span>
          ))}
        </div>
      </div>
    )}
  </>
}

interface Props {
  item: CatalogItem
  isCollected: boolean
  onClose: () => void
  onToggleCollection?: (item: CatalogItem) => void
  collectionLoading?: boolean
}

export function CarDetailModal({ item, isCollected, onClose, onToggleCollection, collectionLoading }: Props) {
  const { displayName, manufacturer, vehicleType } = translateCarName(item.car_name, item.manufacturer)
  const code = getItemCode(item)

  // Swipe-to-dismiss state
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startY = useRef(0)
  const modalRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const modal = modalRef.current
    if (!modal) return
    // Only start drag if scrolled to top
    if (modal.scrollTop <= 0) {
      startY.current = e.touches[0].clientY
      setIsDragging(true)
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0) {
      setDragY(delta)
      e.preventDefault()
    }
  }, [isDragging])

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 120) {
      onClose()
    } else {
      setDragY(0)
    }
  }, [isDragging, dragY, onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl animate-slide-up"
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          opacity: dragY > 0 ? Math.max(0.3, 1 - dragY / 400) : 1,
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-outline-variant/40" />
        </div>

        {onToggleCollection && (
          <div className="px-4 py-2">
            <button
              onClick={() => onToggleCollection(item)}
              disabled={collectionLoading}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all
                ${isCollected
                  ? 'bg-success/10 text-success border border-success/30'
                  : 'bg-primary text-white shadow-sm'
                }
                ${collectionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {collectionLoading ? '處理中...' : isCollected ? '✓ 已收藏（點擊移除）' : '加入我的收藏'}
            </button>
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/40 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Image */}
        <div className="aspect-square bg-surface-container-low flex items-center justify-center">
          {item.image_url ? (
            <img src={item.image_url} alt={item.car_name} className="w-full h-full object-contain p-6" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-on-surface-variant/30">
              <span className="text-6xl">🚗</span>
              <span className="text-sm">NO IMAGE</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-lg font-bold text-primary font-display font-mono tracking-tight">{code}</span>
              {item.source === 'official' && item.series === 'regular' && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">現行</span>
              )}
              {item.source === 'community' && (
                <span className="px-2 py-0.5 bg-outline/10 text-on-surface-variant text-xs font-medium rounded">歷代</span>
              )}
            </div>
            {/* Translated name */}
            <h2 className="text-base font-semibold text-on-surface leading-snug">
              {manufacturer && <span className="text-on-surface-variant">{manufacturer} </span>}
              {displayName}
            </h2>
            {/* Japanese original */}
            <p className="text-sm text-on-surface-variant mt-0.5">{item.car_name}</p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-surface-container-low rounded-lg px-3 py-2">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">產品代號</div>
              <div className="font-medium text-on-surface font-mono">{code}</div>
            </div>
            {manufacturer && (
              <div className="bg-surface-container-low rounded-lg px-3 py-2">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">製造商</div>
                <div className="font-medium text-on-surface">{manufacturer}</div>
              </div>
            )}
            {vehicleType && (
              <div className="bg-surface-container-low rounded-lg px-3 py-2">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">車輛類型</div>
                <div className="font-medium text-on-surface">{vehicleType}</div>
              </div>
            )}
            <div className="bg-surface-container-low rounded-lg px-3 py-2">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">系列</div>
              <div className="font-medium text-on-surface">{SERIES_ZH[item.series] ?? item.series}</div>
            </div>
            <div className="bg-surface-container-low rounded-lg px-3 py-2">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">來源</div>
              <div className="font-medium text-on-surface">{item.source === 'official' ? '官方現行' : '社群歷史'}</div>
            </div>
            {item.release_start && (
              <div className="bg-surface-container-low rounded-lg px-3 py-2">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">販售期間</div>
                <div className="font-medium text-on-surface">
                  {item.release_start}{item.release_end ? ` ~ ${item.release_end}` : ' ~ 現行'}
                </div>
              </div>
            )}
            {item.body_color && item.body_color.length > 0 && (
              <div className="bg-surface-container-low rounded-lg px-3 py-2">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">車身顏色</div>
                <div className="font-medium text-on-surface">{item.body_color.join(', ')}</div>
              </div>
            )}
            {item.attributes && <AttributeGrid attrs={item.attributes} />}
          </div>

        </div>
      </div>
    </div>
  )
}
