import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useCollection } from '../../src/hooks/useCollection'

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [{ id: '1', catalog_id: 'c1' }], error: null }) }) }),
      insert: vi.fn().mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: 'new-1' }, error: null }) }) }),
    }),
  },
}))

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}))

describe('useCollection', () => {
  it('loads collection items', async () => {
    const { result } = renderHook(() => useCollection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(1)
  })
})
