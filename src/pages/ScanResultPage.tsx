import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecognition } from '../hooks/useRecognition'
import { useCollection } from '../hooks/useCollection'
import { ConfidenceRing } from '../components/ConfidenceRing'
import { SubmitCatalogModal } from '../components/SubmitCatalogModal'
import { translateCarName } from '../lib/translate'
import { getItemCode } from '../lib/types'
import type { RecognitionCandidate, Series } from '../lib/types'
import { CATEGORY_ZH, COLOR_ZH } from '../lib/display'

const SERIES_NORMALIZE: Record<string, Series> = {
  'トミカ': 'regular', 'tomica': 'regular',
  'トミカプレミアム': 'premium', 'tomica premium': 'premium', 'premium': 'premium',
  'プレミアムアンリミテッド': 'premium_unlimited', 'premium unlimited': 'premium_unlimited',
  'トミカリミテッドヴィンテージ': 'limited_vintage', 'limited vintage': 'limited_vintage', 'tlv': 'limited_vintage',
  'dream tomica': 'dream', 'dream': 'dream', 'ドリームトミカ': 'dream',
  'disney tomica': 'disney', 'disney': 'disney',
  'cars tomica': 'cars', 'cars': 'cars',
}

const FEATURE_LABELS: Record<string, string> = {
  manufacturer: '製造商',
  car_name: '車名',
  model_number: '型號',
  series: '系列',
  primary_color: '主色',
  secondary_color: '副色',
  vehicle_category: '車型',
  body_style: '車身',
  markings: '車身文字',
  chassis_text: '底盤刻字',
}

function formatFeatureValue(key: string, value: unknown): string | null {
  if (value == null || value === '') return null
  const v = String(value)
  if (key === 'vehicle_category') return CATEGORY_ZH[v] ?? v
  if (key === 'primary_color' || key === 'secondary_color') return COLOR_ZH[v.toLowerCase()] ?? v
  return v
}

function CandidateCard({ candidate, isSelected, onSelect }: {
  candidate: RecognitionCandidate
  isSelected: boolean
  onSelect: () => void
}) {
  const { displayName, manufacturer } = translateCarName(candidate.catalog_item.car_name, candidate.catalog_item.manufacturer)
  const code = getItemCode(candidate.catalog_item)
  const pct = Math.round(candidate.score * 100)
  const level = candidate.score > 0.9 ? 'high' : candidate.score > 0.7 ? 'medium' : 'low'
  const ringColor = { high: 'border-success text-success', medium: 'border-yellow-500 text-yellow-600', low: 'border-outline-variant text-on-surface-variant' }

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left
        ${isSelected ? 'bg-primary/5 ring-2 ring-primary' : 'bg-white hover:bg-surface-container-low'}`}
    >
      <div className="w-16 h-16 shrink-0 bg-surface-container-low rounded-lg flex items-center justify-center overflow-hidden">
        {candidate.catalog_item.image_url
          ? <img src={candidate.catalog_item.image_url} alt="" referrerPolicy="no-referrer" className="w-full h-full object-contain p-1" />
          : <span className="text-2xl">🚗</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-primary font-mono">{code}</span>
          {level === 'high' && <span className="text-[9px] px-1 py-px bg-success/10 text-success rounded font-medium">高匹配</span>}
        </div>
        <div className="text-sm font-medium text-on-surface truncate">{displayName}</div>
        <div className="text-[11px] text-on-surface-variant truncate">
          {manufacturer && `${manufacturer} · `}{candidate.match_reasons[0] ?? ''}
        </div>
      </div>
      <div className={`w-10 h-10 shrink-0 rounded-full border-3 flex items-center justify-center text-xs font-bold ${ringColor[level]}`}>
        {pct}
      </div>
    </button>
  )
}

export function ScanResultPage() {
  const navigate = useNavigate()
  const { result, status, error, capturedImage, reset } = useRecognition()
  const { addToCollection } = useCollection()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-on-surface-variant font-body text-sm">AI 辨識中...</p>
      </div>
    )
  }

  // Error state — show captured image + error
  if (status === 'error') {
    return (
      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <button onClick={() => { reset(); navigate('/') }} className="text-sm text-primary font-semibold">← 重新拍攝</button>

        {capturedImage && (
          <div className="rounded-2xl overflow-hidden shadow-md">
            <img src={capturedImage} alt="拍攝照片" className="w-full h-48 object-cover" />
          </div>
        )}

        <div className="bg-error/5 border border-error/20 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-error text-lg">⚠</span>
            <h3 className="font-display font-semibold text-on-surface">辨識失敗</h3>
          </div>
          <p className="text-sm text-on-surface-variant">{error ?? '無法辨識此照片，請嘗試：'}</p>
          <ul className="text-xs text-on-surface-variant space-y-1 ml-4 list-disc">
            <li>確保照片清晰且光線充足</li>
            <li>對準包裝盒正面或車體側面</li>
            <li>避免過多背景干擾</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <button onClick={() => { reset(); navigate('/') }}
            className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold text-sm">
            重新拍攝
          </button>
          <button onClick={() => { reset(); navigate('/catalog') }}
            className="flex-1 py-3 rounded-xl bg-surface-container-high text-on-surface-variant font-semibold text-sm">
            手動搜尋圖鑑
          </button>
        </div>
      </div>
    )
  }

  // No result (direct navigation to this page)
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <span className="text-4xl">📷</span>
        <p className="text-sm text-on-surface-variant">請先拍攝一台 Tomica 小車</p>
        <button onClick={() => navigate('/')} className="text-primary text-sm font-semibold">返回拍攝</button>
      </div>
    )
  }

  const candidates = result.candidates
  const topCandidate = candidates[0]
  const hasGoodMatch = topCandidate && topCandidate.score > 0.5
  const effectiveId = selectedId ?? topCandidate?.catalog_item.id

  // Extract displayable features from raw_features
  const features = result.raw_features
  const displayFeatures = Object.entries(FEATURE_LABELS)
    .map(([key, label]) => ({ key, label, value: formatFeatureValue(key, features[key]) }))
    .filter((f) => f.value !== null)

  const topGuesses = (features.top_guesses as string[] | undefined) ?? []

  async function handleConfirm() {
    if (!effectiveId) return
    setSaving(true)
    try {
      await addToCollection(effectiveId)
      reset()
      navigate('/catalog')
    } catch {} finally { setSaving(false) }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <button onClick={() => { reset(); navigate('/') }} className="text-sm text-primary font-semibold">← 重新拍攝</button>

      {/* Captured image */}
      {capturedImage && (
        <div className="rounded-2xl overflow-hidden shadow-md">
          <img src={capturedImage} alt="拍攝照片" className="w-full h-48 object-cover" />
        </div>
      )}

      {/* AI detected features */}
      {displayFeatures.length > 0 && (
        <div className="bg-surface-container-low rounded-2xl p-4">
          <h4 className="text-xs font-semibold text-on-surface-variant mb-2">AI 偵測結果</h4>
          <div className="flex flex-wrap gap-1.5">
            {displayFeatures.map((f) => (
              <span key={f.key} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded-full text-xs">
                <span className="text-on-surface-variant">{f.label}:</span>
                <span className="font-medium text-on-surface">{f.value}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Results section */}
      {hasGoodMatch ? (
        <>
          {/* High confidence match */}
          <div className="text-center py-1">
            <ConfidenceRing value={topCandidate.score} />
          </div>
          <h3 className="text-center font-display font-semibold text-on-surface">
            {topCandidate.score > 0.9 ? '找到了！' : '最可能的匹配'}
          </h3>
        </>
      ) : candidates.length > 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600 text-lg">🔍</span>
            <h3 className="font-display font-semibold text-on-surface">信心度較低</h3>
          </div>
          <p className="text-xs text-on-surface-variant">
            AI 無法確定這台車的型號，以下是可能的候選車種。請選擇正確的一台，或手動搜尋圖鑑。
          </p>
        </div>
      ) : (
        <div className="bg-surface-container-low rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-on-surface-variant text-lg">😅</span>
            <h3 className="font-display font-semibold text-on-surface">找不到匹配</h3>
          </div>
          <p className="text-xs text-on-surface-variant">
            AI 無法在圖鑑中找到匹配的車種。可能是照片不夠清晰，或這台車尚未收錄在資料庫中。
          </p>
          {topGuesses.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] text-on-surface-variant mb-1">AI 猜測可能是：</p>
              <div className="flex flex-wrap gap-1.5">
                {topGuesses.map((g, i) => (
                  <span key={i} className="px-2.5 py-1 bg-white rounded-full text-xs font-medium text-on-surface">{g}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Candidate list */}
      {candidates.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-on-surface-variant px-1">
            {hasGoodMatch ? '其他可能' : '可能的車種'} ({candidates.length})
          </h4>
          {candidates.map((c) => (
            <CandidateCard
              key={c.catalog_item.id}
              candidate={c}
              isSelected={c.catalog_item.id === effectiveId}
              onSelect={() => setSelectedId(c.catalog_item.id)}
            />
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-2 pb-4">
        {effectiveId && (
          <button onClick={handleConfirm} disabled={saving}
            className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold text-sm shadow-sm disabled:opacity-50">
            {saving ? '儲存中...' : '確認並加入收藏'}
          </button>
        )}
        <button onClick={() => setSubmitOpen(true)}
          className="w-full py-3 rounded-xl bg-white border border-primary/30 text-primary font-semibold text-sm">
          {hasGoodMatch ? '都不是？建立新條目' : '＋ 圖鑑沒有，貢獻新條目'}
        </button>
        <button onClick={() => { reset(); navigate('/catalog') }}
          className="w-full py-3 rounded-xl bg-surface-container-high text-on-surface-variant font-semibold text-sm">
          手動搜尋圖鑑
        </button>
      </div>

      {submitOpen && (
        <SubmitCatalogModal
          prefill={{
            car_name: (features.car_name as string) ?? (features.top_guesses as string[] | undefined)?.[0] ?? '',
            series: SERIES_NORMALIZE[((features.series as string) ?? '').toLowerCase().trim()] ?? 'regular',
            model_number: (features.model_number as string) ?? '',
            manufacturer: (features.manufacturer as string) ?? '',
            primary_color: (features.primary_color as string) ?? (features.body_color as string) ?? '',
            vehicle_category: (features.vehicle_category as string) ?? '',
            body_style: (features.body_style as string) ?? '',
            image_base64: capturedImage ?? undefined,
          }}
          onClose={() => setSubmitOpen(false)}
          onSuccess={(item) => {
            // After contribution, add to collection automatically
            addToCollection(item.id).catch(() => {})
            reset()
            navigate('/catalog')
          }}
        />
      )}
    </div>
  )
}
