import { useEffect, useRef, useState } from 'react'
import { compressImage } from '../lib/image'
import { supabase } from '../lib/supabase'
import { CATEGORY_ZH, BODY_STYLE_ZH, COLOR_HEX, COLOR_ZH } from '../lib/display'
import type { CatalogItem, Series } from '../lib/types'

const SERIES_OPTIONS: { value: Series; label: string }[] = [
  { value: 'regular', label: '常規' },
  { value: 'premium', label: 'Premium' },
  { value: 'premium_unlimited', label: 'Premium Unlimited' },
  { value: 'limited_vintage', label: 'Limited Vintage' },
  { value: 'dream', label: 'Dream' },
  { value: 'disney', label: 'Disney' },
  { value: 'cars', label: 'Cars' },
  { value: 'giftset', label: '禮盒' },
  { value: 'town', label: 'Town' },
  { value: 'fandom', label: '其他' },
]

const COLOR_OPTIONS = ['red', 'blue', 'white', 'black', 'silver', 'yellow', 'green', 'orange', 'gold', 'gray', 'pink', 'purple']
const VEHICLE_CATEGORIES = ['car', 'truck', 'bus', 'emergency', 'construction', 'motorcycle', 'train', 'fantasy']
const BODY_STYLES = ['sedan', 'suv', 'coupe', 'wagon', 'van', 'pickup', 'convertible', 'hatchback', 'cab_over', 'special']

export interface SubmitPrefill {
  car_name?: string
  series?: Series
  model_number?: string
  manufacturer?: string
  primary_color?: string
  vehicle_category?: string
  body_style?: string
  image_base64?: string
}

interface Props {
  prefill?: SubmitPrefill
  onClose: () => void
  onSuccess?: (item: CatalogItem, duplicate: boolean) => void
}

export function SubmitCatalogModal({ prefill, onClose, onSuccess }: Props) {
  const [carName, setCarName] = useState(prefill?.car_name ?? '')
  const [series, setSeries] = useState<Series>(prefill?.series ?? 'regular')
  const [modelNumber, setModelNumber] = useState(prefill?.model_number ?? '')
  const [manufacturer, setManufacturer] = useState(prefill?.manufacturer ?? '')
  const [primaryColor, setPrimaryColor] = useState(prefill?.primary_color?.toLowerCase() ?? '')
  const [vehicleCategory, setVehicleCategory] = useState(prefill?.vehicle_category?.toLowerCase() ?? '')
  const [bodyStyle, setBodyStyle] = useState(prefill?.body_style?.toLowerCase() ?? '')
  const [year, setYear] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [imageBase64, setImageBase64] = useState<string | null>(prefill?.image_base64 ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleFile(file: File) {
    setError(null)
    try {
      const dataUri = await compressImage(file)
      setImageBase64(dataUri)
    } catch {
      setError('圖片處理失敗，請換一張')
    }
  }

  async function handleSubmit() {
    setError(null)
    if (!imageBase64) { setError('請選擇圖片'); return }
    if (carName.trim().length < 2) { setError('請輸入車名（至少 2 字）'); return }

    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('請先登入')
        setSubmitting(false)
        return
      }

      const yearNum = year ? parseInt(year, 10) : undefined
      const payload = {
        car_name: carName.trim(),
        series,
        model_number: modelNumber.trim() || undefined,
        manufacturer: manufacturer.trim() || undefined,
        primary_color: primaryColor || undefined,
        vehicle_category: vehicleCategory || undefined,
        body_style: bodyStyle || undefined,
        release_year: Number.isFinite(yearNum) ? yearNum : undefined,
        notes: notes.trim() || undefined,
        image_base64: imageBase64,
      }

      const resp = await fetch('/api/submit-catalog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      })
      const data = await resp.json() as { item?: CatalogItem; duplicate?: boolean; error?: string }
      if (!resp.ok) {
        setError(data.error ?? '建立失敗')
        setSubmitting(false)
        return
      }
      if (data.item) onSuccess?.(data.item, !!data.duplicate)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '網路錯誤')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-lg bg-surface rounded-t-3xl md:rounded-3xl max-h-[92vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface px-5 pt-5 pb-3 flex items-center justify-between border-b border-outline-variant/20 z-10">
          <h2 className="font-display text-lg font-bold text-on-surface">貢獻新條目</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-on-surface-variant mb-1.5 block">照片 *</label>
            <div
              className="aspect-[4/3] bg-surface-container-low rounded-xl flex items-center justify-center overflow-hidden cursor-pointer border-2 border-dashed border-outline-variant/40 hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {imageBase64 ? (
                <img src={imageBase64} alt="預覽" className="w-full h-full object-contain" />
              ) : (
                <div className="text-center">
                  <div className="text-3xl mb-1">📷</div>
                  <p className="text-xs text-on-surface-variant">點擊選擇照片</p>
                  <p className="text-[10px] text-on-surface-variant/60 mt-0.5">jpeg / png / webp，5MB 內</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-on-surface-variant mb-1 block">車名 *</label>
            <input
              type="text"
              value={carName}
              onChange={(e) => setCarName(e.target.value)}
              placeholder="如：NISSAN GT-R NISMO"
              className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-on-surface-variant mb-1 block">系列 *</label>
            <select
              value={series}
              onChange={(e) => setSeries(e.target.value as Series)}
              className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            >
              {SERIES_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-on-surface-variant mb-1 block">編號</label>
              <input
                type="text"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                placeholder="No.23 / LV-86"
                className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant mb-1 block">發行年</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                min={1970}
                max={2099}
                placeholder="2024"
                className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-on-surface-variant mb-1 block">製造商</label>
            <input
              type="text"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="Toyota / Nissan / Honda"
              className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-on-surface-variant mb-1.5 block">主色</label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPrimaryColor(primaryColor === c ? '' : c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center
                    ${primaryColor === c ? 'border-primary scale-110' : 'border-outline-variant/30'}`}
                  style={{ backgroundColor: COLOR_HEX[c] ?? c }}
                  title={COLOR_ZH[c] ?? c}
                >
                  {primaryColor === c && (
                    <span className={`text-[10px] font-bold ${c === 'white' || c === 'yellow' ? 'text-on-surface' : 'text-white'}`}>✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-on-surface-variant mb-1.5 block">車型</label>
            <div className="flex flex-wrap gap-1.5">
              {VEHICLE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setVehicleCategory(vehicleCategory === c ? '' : c)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all
                    ${vehicleCategory === c
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'bg-white text-on-surface-variant border border-outline-variant/20'
                    }`}
                >
                  {CATEGORY_ZH[c] ?? c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-on-surface-variant mb-1.5 block">車身樣式</label>
            <div className="flex flex-wrap gap-1.5">
              {BODY_STYLES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBodyStyle(bodyStyle === c ? '' : c)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all
                    ${bodyStyle === c
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'bg-white text-on-surface-variant border border-outline-variant/20'
                    }`}
                >
                  {BODY_STYLE_ZH[c] ?? c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-on-surface-variant mb-1 block">備註</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="購入處、活動限定資訊⋯"
              className="w-full px-3 py-2 rounded-lg bg-white border border-outline-variant/30 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none"
            />
          </div>

          <div className="text-[11px] text-on-surface-variant bg-surface-container-low rounded-lg p-2.5 leading-relaxed">
            提交後條目會立刻在公開圖鑑出現（標記「玩家提供」），方便其他人辨識與收藏。被認領的車也會幫 AI 補資料。
          </div>

          {error && (
            <div className="text-xs text-error bg-error/5 border border-error/20 rounded-lg p-2.5">{error}</div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm shadow-sm disabled:opacity-50"
          >
            {submitting ? '提交中⋯' : '提交'}
          </button>
        </div>
      </div>
    </div>
  )
}
