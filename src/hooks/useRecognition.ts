import { useState } from 'react'
import type { RecognitionResult, AiProvider } from '../lib/types'
import { useAuth } from './useAuth'
import { supabase } from '../lib/supabase'

type Status = 'idle' | 'loading' | 'success' | 'error'

export function useRecognition() {
  const { user } = useAuth()
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<RecognitionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function identify(imageBase64: string) {
    if (!user) throw new Error('Not authenticated')
    setStatus('loading')
    setError(null)
    setResult(null)
    try {
      const { data: settings } = await supabase.from('user_settings').select('ai_provider').eq('user_id', user.id).single()
      const provider: AiProvider = settings?.ai_provider ?? 'openai'

      // Get current session token for auth
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }

  function reset() { setStatus('idle'); setResult(null); setError(null) }

  return { status, result, error, identify, reset }
}
