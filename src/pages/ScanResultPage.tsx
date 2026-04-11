import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecognition } from '../hooks/useRecognition'
import { useCollection } from '../hooks/useCollection'
import { ConfidenceRing } from '../components/ConfidenceRing'
import { CorrectionDropdown } from '../components/CorrectionDropdown'

export function ScanResultPage() {
  const navigate = useNavigate()
  const { result, status, error, reset } = useRecognition()
  const { addToCollection } = useCollection()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-on-surface-variant font-body text-sm">AI 辨識中...</p>
      </div>
    )
  }

  if (status === 'error' || !result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <p className="text-error text-sm">{error ?? '辨識失敗，請重試'}</p>
        <button onClick={() => { reset(); navigate('/') }} className="text-primary text-sm font-semibold">返回首頁</button>
      </div>
    )
  }

  const topCandidate = result.candidates[0]
  const effectiveId = selectedId ?? topCandidate?.catalog_item.id

  async function handleConfirm() {
    if (!effectiveId) return
    setSaving(true)
    try { await addToCollection(effectiveId); reset(); navigate('/collection') } catch {} finally { setSaving(false) }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      <button onClick={() => { reset(); navigate('/') }} className="text-sm text-primary font-semibold">← 返回</button>
      {topCandidate && (
        <>
          <div className="text-center py-2"><ConfidenceRing value={topCandidate.score} /></div>
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
            <div className="h-40 bg-surface-container-low flex items-center justify-center text-5xl">
              {topCandidate.catalog_item.image_url ? <img src={topCandidate.catalog_item.image_url} alt="" className="h-full object-contain" /> : '🚗'}
            </div>
            <div className="p-4">
              <h3 className="font-display font-bold text-lg mb-3">{topCandidate.catalog_item.model_number} {topCandidate.catalog_item.car_name}</h3>
              {[['系列', topCandidate.catalog_item.series === 'regular' ? '常規 トミカ' : topCandidate.catalog_item.series],
                ['車體顏色', topCandidate.catalog_item.body_color?.join(', ')],
                ['製造商', topCandidate.catalog_item.manufacturer],
                ['初回特別仕樣', topCandidate.catalog_item.is_first_edition ? '是' : '否']
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-surface-container-low last:border-0 text-sm">
                  <span className="text-on-surface-variant">{label}</span>
                  <span className="font-medium">{value ?? '-'}</span>
                </div>
              ))}
            </div>
          </div>
          {result.candidates.length > 1 && <CorrectionDropdown candidates={result.candidates} selected={effectiveId} onSelect={setSelectedId} />}
          <button onClick={handleConfirm} disabled={saving}
            className="w-full py-3.5 rounded-full bg-gradient-to-br from-primary-container to-primary-dark text-white font-display font-semibold text-sm shadow-md disabled:opacity-50">
            {saving ? '儲存中...' : '✓ 確認並加入收藏'}
          </button>
        </>
      )}
    </div>
  )
}
