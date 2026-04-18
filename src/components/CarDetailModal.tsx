import { useEffect } from 'react'
import type { CatalogItem } from '../lib/types'
import { getItemCode } from '../lib/types'
import { translateCarName } from '../lib/translate'

const COLOR_ZH: Record<string, string> = {
  white: '白色', black: '黑色', red: '紅色', blue: '藍色', silver: '銀色',
  yellow: '黃色', green: '綠色', orange: '橙色', gold: '金色', gray: '灰色',
  grey: '灰色', brown: '棕色', pink: '粉紅', purple: '紫色', beige: '米色',
  navy: '深藍', cream: '奶油色', chrome: '鍍鉻', copper: '銅色', maroon: '栗色',
}
const COLOR_HEX: Record<string, string> = {
  white: '#F9FAFB', black: '#1F2937', red: '#DC2626', blue: '#2563EB',
  silver: '#9CA3AF', yellow: '#EAB308', green: '#16A34A', orange: '#EA580C',
  gold: '#D97706', gray: '#6B7280', grey: '#6B7280', brown: '#92400E',
  pink: '#EC4899', purple: '#7C3AED', beige: '#D2B48C', navy: '#1E3A5F',
  cream: '#FFFDD0', chrome: '#C0C0C0', copper: '#B87333', maroon: '#800000',
}
function colorToZh(c: string): string { return COLOR_ZH[c.toLowerCase()] ?? c }
function colorToHex(c: string): string { return COLOR_HEX[c.toLowerCase()] ?? c }

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

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
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
              <div className="font-medium text-on-surface">{{ regular: '常規', premium: 'Premium', premium_unlimited: 'Premium Unlimited', limited_vintage: 'Limited Vintage', dream: 'Dream' }[item.series] ?? item.series}</div>
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
            {item.attributes && (
              <>
                <div className="bg-surface-container-low rounded-lg px-3 py-2">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">車型分類</div>
                  <div className="font-medium text-on-surface">
                    {{ car: '轎車', truck: '卡車', bus: '巴士', emergency: '緊急車輛', construction: '工程車', motorcycle: '機車', aircraft: '飛機', boat: '船', train: '列車', fantasy: '造型車' }[item.attributes.vehicle_category] ?? item.attributes.vehicle_category}
                  </div>
                </div>
                <div className="bg-surface-container-low rounded-lg px-3 py-2">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">車身型式</div>
                  <div className="font-medium text-on-surface">
                    {{ sedan: '四門轎車', suv: 'SUV', coupe: '雙門跑車', wagon: '旅行車', van: '箱型車', pickup: '皮卡', convertible: '敞篷', hatchback: '掀背', cab_over: '平頭車', special: '特殊' }[item.attributes.body_style] ?? item.attributes.body_style}
                  </div>
                </div>
                <div className="bg-surface-container-low rounded-lg px-3 py-2">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">車色</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="w-5 h-5 rounded-full border border-outline-variant/30 inline-block shadow-sm" style={{ backgroundColor: colorToHex(item.attributes.primary_color) }} />
                    <span className="font-medium text-on-surface">{colorToZh(item.attributes.primary_color)}</span>
                    {item.attributes.secondary_color && (
                      <>
                        <span className="text-on-surface-variant/50 mx-0.5">/</span>
                        <span className="w-5 h-5 rounded-full border border-outline-variant/30 inline-block shadow-sm" style={{ backgroundColor: colorToHex(item.attributes.secondary_color) }} />
                        <span className="font-medium text-on-surface">{colorToZh(item.attributes.secondary_color)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="bg-surface-container-low rounded-lg px-3 py-2">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">輪子</div>
                  <div className="font-medium text-on-surface">{item.attributes.wheel_count} 輪</div>
                </div>
                <div className="bg-surface-container-low rounded-lg px-3 py-2">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">車身大小</div>
                  <div className="font-medium text-on-surface">
                    {{ small: '小型', medium: '中型', large: '大型', extra_large: '超大型' }[item.attributes.size_class] ?? item.attributes.size_class}
                  </div>
                </div>
                <div className="bg-surface-container-low rounded-lg px-3 py-2">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">年代風格</div>
                  <div className="font-medium text-on-surface">
                    {{ classic: '經典', modern: '現代', futuristic: '未來', retro: '復古' }[item.attributes.era_style] ?? item.attributes.era_style}
                  </div>
                </div>
                <div className="bg-surface-container-low rounded-lg px-3 py-2">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">車窗</div>
                  <div className="font-medium text-on-surface">
                    {{ standard: '標準', none: '無', panoramic: '全景', cab: '駕駛室' }[item.attributes.window_style] ?? item.attributes.window_style}
                  </div>
                </div>
                <div className="bg-surface-container-low rounded-lg px-3 py-2">
                  <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-0.5">塗裝</div>
                  <div className="font-medium text-on-surface">{item.attributes.has_livery ? '有塗裝' : '素色'}</div>
                </div>
                {item.attributes.features.length > 0 && (
                  <div className="bg-surface-container-low rounded-lg px-3 py-2 col-span-2">
                    <div className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-1">特殊配件</div>
                    <div className="flex flex-wrap gap-1.5">
                      {item.attributes.features.map((f) => (
                        <span key={f} className="px-2.5 py-1 bg-primary/10 text-primary text-[11px] font-medium rounded-full">
                          {{ police_light: '🚨 警燈', ladder: '🪜 梯子', wing: '翼', blade: '刀片', crane: '🏗️ 吊臂', antenna: '📡 天線', decal: '🎨 貼紙', open_top: '☀️ 開頂', tank: '🛢️ 油罐', trailer: '🚛 拖車', bucket: '🪣 鏟斗', hose: '🔧 管線', plow: '除雪鏟', box_body: '📦 箱體', flatbed: '平板', drill: '🔩 鑽頭' }[f] ?? f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Collection action button */}
          {onToggleCollection && (
            <button
              onClick={() => onToggleCollection(item)}
              disabled={collectionLoading}
              className={`w-full py-3 rounded-xl text-sm font-semibold transition-all
                ${isCollected
                  ? 'bg-surface-container-high text-on-surface-variant hover:bg-error/10 hover:text-error'
                  : 'bg-primary text-white hover:bg-primary-dark shadow-sm'
                }
                ${collectionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {collectionLoading ? '處理中...' : isCollected ? '從收藏移除' : '加入我的收藏'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
