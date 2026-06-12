import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useAuth } from '../../src/hooks/useAuth'

vi.mock('../../src/lib/supabase', () => {
  const mockAuth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }
  return { supabase: { auth: mockAuth } }
})

describe('useAuth', () => {
  it('starts with loading true and no user', async () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })
})
