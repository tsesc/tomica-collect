export type Series = 'regular' | 'premium' | 'limited_vintage' | 'dream'
export type VehicleType = 'sedan' | 'suv' | 'truck' | 'bus' | 'sports' | 'emergency' | 'construction' | 'other'
export type Condition = 'mint' | 'good' | 'fair' | 'poor'
export type AiProvider = 'openai' | 'gemini' | 'claude'
export type InputType = 'box_front' | 'box_back' | 'loose' | 'chassis'

export interface CatalogItem {
  id: string
  model_number: string
  car_name: string
  car_name_en: string | null
  series: Series
  is_first_edition: boolean
  manufacturer: string | null
  vehicle_type: VehicleType | null
  body_color: string[]
  release_date: string | null
  retired: boolean
  image_url: string | null
  source: 'official' | 'community' | 'manual'
  variant: number | null
  release_start: string | null
  release_end: string | null
  metadata: Record<string, unknown>
}

export interface CollectionItem {
  id: string
  user_id: string
  catalog_id: string
  photo_url: string | null
  condition: Condition
  has_box: boolean
  notes: string | null
  acquired_date: string | null
  catalog?: CatalogItem
}

export interface RecognitionCandidate {
  catalog_item: CatalogItem
  score: number
  match_reasons: string[]
}

export interface RecognitionResult {
  input_type: InputType
  candidates: RecognitionCandidate[]
  raw_features: Record<string, unknown>
}

export interface UserSettings {
  user_id: string
  ai_provider: AiProvider
  api_keys: Record<AiProvider, string>
}
