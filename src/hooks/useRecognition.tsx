import { useState, createContext, useContext } from 'react'
import type { RecognitionResult, AiProvider } from '../lib/types'
import { useAuth } from './useAuth'
import { supabase } from '../lib/supabase'

export type RecognitionStatus = 'idle' | 'loading' | 'success' | 'error'

interface RecognitionState {
  status: RecognitionStatus
  result: RecognitionResult | null
  error: string | null
  capturedImage: string | null
  identify: (imageBase64: string) => Promise<boolean>
  reset: () => void
}

const RecognitionContext = createContext<RecognitionState | null>(null)

export function RecognitionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [status, setStatus] = useState<RecognitionStatus>('idle')
  const [result, setResult] = useState<RecognitionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)

  async function identify(imageBase64: string): Promise<boolean> {
    if (!user) { setError('請先登入'); setStatus('error'); return false }
    setStatus('loading')
    setError(null)
    setResult(null)
    setCapturedImage(imageBase64)
    try {
      const { data: settings } = await supabase.from('user_settings').select('ai_provider').eq('user_id', user.id).single()
      const provider: AiProvider = settings?.ai_provider ?? 'openai'

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('No active session')

      const resp = await fetch('/api/identify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ image_base64: imageBase64, ai_provider: provider }),
      })
      if (!resp.ok) { const data = await resp.json(); throw new Error(data.error ?? 'Recognition failed') }
      const data: RecognitionResult = await resp.json()
      setResult(data)
      setStatus('success')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
      return false
    }
  }

  function reset() { setStatus('idle'); setResult(null); setError(null); setCapturedImage(null) }

  return (
    <RecognitionContext.Provider value={{ status, result, error, capturedImage, identify, reset }}>
      {children}
    </RecognitionContext.Provider>
  )
}

export function useRecognition(): RecognitionState {
  const ctx = useContext(RecognitionContext)
  if (!ctx) throw new Error('useRecognition must be used within RecognitionProvider')
  return ctx
}
