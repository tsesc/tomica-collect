import { useRef } from 'react'

interface Props {
  onCapture: (file: File) => void
}

export function PhotoCapture({ onCapture }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onCapture(file)
  }

  return (
    <div className="bg-gradient-to-br from-primary-container to-primary-dark rounded-2xl p-6 text-white text-center">
      <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">📷</div>
      <h2 className="font-display font-bold text-lg mb-1">辨識你的 Tomica</h2>
      <p className="text-sm opacity-80 mb-4">拍攝盒裝或車體，AI 自動辨識型號</p>
      <div className="flex gap-3">
        <button onClick={() => cameraRef.current?.click()} className="flex-1 py-2.5 bg-white text-primary rounded-full font-display font-semibold text-sm">拍照辨識</button>
        <button onClick={() => fileRef.current?.click()} className="flex-1 py-2.5 border border-white/40 rounded-full font-display font-semibold text-sm">從相簿選擇</button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}
