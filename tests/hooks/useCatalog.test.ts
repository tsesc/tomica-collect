import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useCatalog } from '../../src/hooks/useCatalog'

const mockItems = [
  { id: '1', model_number: 'No.1', car_name: '日産 GT-R', series: 'regular', manufacturer: 'Nissan' },
  { id: '2', model_number: 'No.2', car_name: 'Suzuki Jimny', series: 'regular', manufacturer: 'Suzuki' },
]

vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: mockItems, error: null }) }) }) },
}))

describe('useCatalog', () => {
  it('loads catalog items on mount', async () => {
    const { result } = renderHook(() => useCatalog())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(2)
  })
})
