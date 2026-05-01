import { useNavigate } from 'react-router-dom'
import { PhotoCapture } from '../components/PhotoCapture'
import { StatsRow } from '../components/StatsRow'
import { useCollection } from '../hooks/useCollection'
import { useCatalog } from '../hooks/useCatalog'
import { compressImage } from '../lib/image'
import { useRecognition } from '../hooks/useRecognition'

export function HomePage() {
  const navigate = useNavigate()
  const { items: collection } = useCollection()
  const { items: catalog } = useCatalog()
  const { status, error, identify } = useRecognition()

  const collected = collection.length
  const total = catalog.length
  const missing = total - collected
  const recent = collection.slice(0, 5)

  const isProcessing = status === 'loading'

  async function handleCapture(file: File) {
    const base64 = await compressImage(file)
    const success = await identify(base64)
    if (success) {
      navigate('/scan-result')
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-5 relative">
      {/* Loading overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-white font-display font-semibold text-lg">AI 辨識中...</p>
          <p className="text-white/60 text-sm">正在分析您的照片，請稍候</p>
        </div>
      )}

      <PhotoCapture onCapture={handleCapture} disabled={isProcessing} />

      {/* Error message */}
      {status === 'error' && error && (
        <div className="bg-error/10 text-error text-sm rounded-xl p-3 text-center">
          {error}
        </div>
      )}

      <StatsRow collected={collected} missing={missing} total={total} />
      <div className="flex justify-between items-center">
        <h3 className="font-display font-semibold text-on-surface">最近加入</h3>
        <button onClick={() => navigate('/collection')} className="text-xs text-primary">查看全部</button>
      </div>
      <div className="space-y-2.5">
        {recent.map((item) => (
          <div key={item.id} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm">
            <div className="w-12 h-12 bg-surface-container-low rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
              {item.catalog?.image_url ? <img src={item.catalog.image_url} alt="" referrerPolicy="no-referrer" className="w-full h-full object-contain rounded-lg" /> : '🚗'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{item.catalog?.model_number} {item.catalog?.car_name}</div>
              <div className="text-xs text-on-surface-variant">{item.catalog?.series === 'regular' ? '常規系列' : item.catalog?.series} · {item.catalog?.body_color?.join(', ')}</div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium flex-shrink-0">已收藏</span>
          </div>
        ))}
        {recent.length === 0 && <p className="text-center text-sm text-on-surface-variant py-8">還沒有收藏，拍一台試試吧！</p>}
      </div>
    </div>
  )
}
