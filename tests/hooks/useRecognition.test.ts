import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRecognition } from '../../src/hooks/useRecognition'

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' } }),
}))

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { ai_provider: 'openai' }, error: null }) }) }),
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'test-token' } }, error: null }),
    },
  },
}))

describe('useRecognition', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('starts idle with no result', () => {
    const { result } = renderHook(() => useRecognition())
    expect(result.current.status).toBe('idle')
    expect(result.current.result).toBeNull()
  })

  it('sets status to loading then success on identify', async () => {
    const mockResult = {
      input_type: 'box_front',
      candidates: [{ catalog_item: { id: '1', model_number: 'No.23', car_name: '日産 GT-R' }, score: 0.96, match_reasons: ['Exact match'] }],
      raw_features: {},
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockResult) })
    const { result } = renderHook(() => useRecognition())
    await act(async () => { await result.current.identify('data:image/jpeg;base64,fake') })
    expect(result.current.status).toBe('success')
    expect(result.current.result?.candidates).toHaveLength(1)
  })
})
