import { describe, it, expect } from 'vitest'
import { matchCandidates } from '../../functions/api/identify'

const CATALOG = [
  { id: '1', model_number: 'No.23', car_name: '日産 GT-R', car_name_en: 'Nissan GT-R', manufacturer: 'Nissan', body_color: ['紅'], vehicle_type: 'sports' },
  { id: '2', model_number: 'No.46', car_name: 'Honda NSX', car_name_en: 'Honda NSX', manufacturer: 'Honda', body_color: ['白'], vehicle_type: 'sports' },
  { id: '3', model_number: 'No.110', car_name: 'Toyota Crown', car_name_en: 'Toyota Crown', manufacturer: 'Toyota', body_color: ['黑'], vehicle_type: 'sedan' },
]

describe('matchCandidates', () => {
  it('returns exact match when model_number provided', () => {
    const result = matchCandidates({ model_number: 'No.23' }, CATALOG)
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(0.99)
    expect(result[0].item.car_name).toBe('日産 GT-R')
  })

  it('returns fuzzy matches when no model_number', () => {
    const result = matchCandidates({ manufacturer: 'Nissan', car_name: 'GT-R', body_color: '紅', vehicle_type: 'sports' }, CATALOG)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].item.model_number).toBe('No.23')
    expect(result[0].score).toBeGreaterThan(0.5)
  })

  it('returns empty when nothing matches', () => {
    const result = matchCandidates({ manufacturer: 'Ferrari', car_name: 'F40' }, CATALOG)
    expect(result).toHaveLength(0)
  })
})

const CATALOG_WITH_ATTRS = [
  { id: '1', model_number: 'No.23', car_name: '日産 GT-R', car_name_en: 'Nissan GT-R', manufacturer: 'Nissan', body_color: ['紅'], vehicle_type: 'sports',
    attributes: { vehicle_category: 'car', body_style: 'coupe', primary_color: 'red', secondary_color: null, wheel_count: 4, size_class: 'medium', features: [], era_style: 'modern', has_livery: false, window_style: 'standard' } },
  { id: '2', model_number: 'No.46', car_name: 'Honda NSX', car_name_en: 'Honda NSX', manufacturer: 'Honda', body_color: ['白'], vehicle_type: 'sports',
    attributes: { vehicle_category: 'car', body_style: 'coupe', primary_color: 'white', secondary_color: null, wheel_count: 4, size_class: 'medium', features: [], era_style: 'modern', has_livery: false, window_style: 'standard' } },
  { id: '4', model_number: 'No.75', car_name: 'Honda NSX パトロールカー', car_name_en: null, manufacturer: 'Honda', body_color: ['白', '黒'], vehicle_type: 'emergency',
    attributes: { vehicle_category: 'emergency', body_style: 'coupe', primary_color: 'white', secondary_color: 'black', wheel_count: 4, size_class: 'medium', features: ['police_light'], era_style: 'modern', has_livery: true, window_style: 'standard' } },
]

describe('matchCandidates with attributes', () => {
  it('scores higher when attributes match', () => {
    const result = matchCandidates(
      { manufacturer: 'Honda', primary_color: 'white', vehicle_category: 'car', body_style: 'coupe' },
      CATALOG_WITH_ATTRS
    )
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].item.model_number).toBe('No.46')
  })

  it('features overlap boosts emergency vehicle', () => {
    const result = matchCandidates(
      { manufacturer: 'Honda', vehicle_category: 'emergency', primary_color: 'white', features: ['police_light'] },
      CATALOG_WITH_ATTRS
    )
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].item.model_number).toBe('No.75')
  })
})
