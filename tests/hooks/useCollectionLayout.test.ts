import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCollectionLayout } from '../../src/hooks/useCollectionLayout'

const mockSingle = vi.fn()
const mockUpsert = vi.fn()

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => mockSingle() }) }),
      upsert: (...args: unknown[]) => {
        mockUpsert(...args)
        return Promise.resolve({ error: null })
      },
    }),
  },
}))

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}))

const item = (catalogId: string) => ({ catalog_id: catalogId })

describe('useCollectionLayout', () => {
  beforeEach(() => {
    localStorage.clear()
    mockSingle.mockReset().mockResolvedValue({ data: { collection_layout: null } })
    mockUpsert.mockReset()
  })

  it('keeps saved order and floats unknown (new) cars to the front', async () => {
    mockSingle.mockResolvedValue({
      data: { collection_layout: { order: ['b', 'a'], sizes: {} } },
    })
    const { result } = renderHook(() => useCollectionLayout())
    await waitFor(() => expect(result.current.layout.order).toEqual(['b', 'a']))

    const arranged = result.current.arrange([item('a'), item('b'), item('new')])
    expect(arranged.map((i) => i.catalog_id)).toEqual(['new', 'b', 'a'])
  })

  it('cycles tile size s → m → l → s and writes localStorage synchronously', () => {
    const { result } = renderHook(() => useCollectionLayout())
    expect(result.current.sizeOf('x')).toBe('s')

    act(() => result.current.cycleSize('x'))
    expect(result.current.sizeOf('x')).toBe('m')
    act(() => result.current.cycleSize('x'))
    expect(result.current.sizeOf('x')).toBe('l')
    act(() => result.current.cycleSize('x'))
    expect(result.current.sizeOf('x')).toBe('s')

    const cached = JSON.parse(localStorage.getItem('tomica:collection-layout:test-user')!)
    expect(cached.sizes.x).toBe('s')
    // DB sync is debounced — nothing hits Supabase immediately
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('commitOrder replaces the arrangement and syncs to DB once (debounced)', async () => {
    const { result } = renderHook(() => useCollectionLayout())
    act(() => result.current.commitOrder(['c', 'a']))
    act(() => result.current.commitOrder(['c', 'a', 'b']))
    expect(result.current.layout.order).toEqual(['c', 'a', 'b'])

    const arranged = result.current.arrange([item('a'), item('b'), item('c')])
    expect(arranged.map((i) => i.catalog_id)).toEqual(['c', 'a', 'b'])

    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(mockUpsert.mock.calls[0][0]).toMatchObject({
      user_id: 'test-user',
      collection_layout: { order: ['c', 'a', 'b'] },
    })
  })

  it('hydrates from localStorage before the DB answers', async () => {
    localStorage.setItem(
      'tomica:collection-layout:test-user',
      JSON.stringify({ order: ['z'], sizes: { z: 'l' } }),
    )
    mockSingle.mockReturnValue(new Promise(() => {})) // DB never resolves
    const { result } = renderHook(() => useCollectionLayout())
    await waitFor(() => expect(result.current.sizeOf('z')).toBe('l'))
    expect(result.current.layout.order).toEqual(['z'])
  })

  it('ignores malformed remote layout', async () => {
    mockSingle.mockResolvedValue({ data: { collection_layout: { bogus: true } } })
    const { result } = renderHook(() => useCollectionLayout())
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.layout.order).toEqual([])
  })
})
