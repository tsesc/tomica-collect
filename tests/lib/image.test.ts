import { describe, it, expect, vi } from 'vitest'
import { compressImage } from '../../src/lib/image'

describe('compressImage', () => {
  it('returns a base64 string', async () => {
    const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' })
    const file = new File([blob], 'test.jpg', { type: 'image/jpeg' })

    vi.mock('browser-image-compression', () => ({
      default: vi.fn().mockResolvedValue(new Blob(['compressed'], { type: 'image/jpeg' })),
    }))

    const result = await compressImage(file)
    expect(result).toMatch(/^data:image\/jpeg;base64,/)
  })
})
