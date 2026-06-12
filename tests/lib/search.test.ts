import { describe, it, expect } from 'vitest'
import { buildSearchIndex, matchesSearch } from '../../src/lib/search'
import type { CatalogItem } from '../../src/lib/types'

function makeItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'test-id',
    model_number: 'No.1',
    car_name: 'トヨタ クラウン',
    car_name_en: 'Toyota Crown',
    series: 'regular',
    is_first_edition: false,
    manufacturer: 'Toyota',
    vehicle_type: 'sedan',
    body_color: ['white'],
    release_date: null,
    retired: false,
    image_url: null,
    source: 'official',
    variant: null,
    release_start: null,
    release_end: null,
    attributes: null,
    metadata: {},
    ...overrides,
  }
}

describe('buildSearchIndex with zh name fields', () => {
  it('includes car_name_zh_tw in the index', () => {
    const index = buildSearchIndex(makeItem({ car_name_zh_tw: '豐田 皇冠轎車' }))
    expect(index).toContain('豐田 皇冠轎車')
  })

  it('includes car_name_zh_hk in the index', () => {
    const index = buildSearchIndex(makeItem({ car_name_zh_hk: '豐田 皇冠的士' }))
    expect(index).toContain('豐田 皇冠的士')
  })

  it('includes car_name_zh_cn in the index', () => {
    const index = buildSearchIndex(makeItem({ car_name_zh_cn: '丰田 皇冠轿车' }))
    expect(index).toContain('丰田 皇冠轿车')
  })

  it('omits zh fields when null or undefined', () => {
    const index = buildSearchIndex(makeItem({ car_name_zh_tw: null }))
    expect(index).toContain('トヨタ クラウン')
    expect(index).not.toContain('null')
    expect(index).not.toContain('undefined')
  })
})

describe('matchesSearch against zh names', () => {
  it('matches a zh-TW car name query', () => {
    const index = buildSearchIndex(makeItem({ car_name_zh_tw: '日產 天際線跑車' }))
    expect(matchesSearch(index, '天際線')).toBe(true)
  })

  it('matches a zh-CN car name query', () => {
    const index = buildSearchIndex(makeItem({ car_name_zh_cn: '本田 思域' }))
    expect(matchesSearch(index, '思域')).toBe(true)
  })

  it('still expands synonyms alongside zh names (簡體 query hits 繁體 brand)', () => {
    // car_name_zh_tw contains 豐田; query 丰田 expands via the brand synonym group
    const index = buildSearchIndex(makeItem({ car_name: 'クラウン', car_name_en: null, manufacturer: null, car_name_zh_tw: '豐田 皇冠' }))
    expect(matchesSearch(index, '丰田')).toBe(true)
  })

  it('multi-token AND query combines zh name and synonym token', () => {
    const index = buildSearchIndex(makeItem({ car_name_zh_cn: '丰田 救护车', body_color: ['white'] }))
    expect(matchesSearch(index, '丰田 救护车')).toBe(true)
  })

  it('does not match an unrelated zh query', () => {
    const index = buildSearchIndex(makeItem({ car_name_zh_tw: '豐田 皇冠' }))
    expect(matchesSearch(index, '消防雲梯')).toBe(false)
  })
})
