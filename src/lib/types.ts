export type Series = 'regular' | 'premium' | 'premium_unlimited' | 'limited_vintage' | 'dream' | 'fandom' | 'disney' | 'cars' | 'giftset' | 'town' | 'unlimited'
export type VehicleType = 'sedan' | 'suv' | 'truck' | 'bus' | 'sports' | 'emergency' | 'construction' | 'other'
export type Condition = 'mint' | 'good' | 'fair' | 'poor'
export type AiProvider = 'openai' | 'gemini' | 'claude'
export type InputType = 'box_front' | 'box_back' | 'loose' | 'chassis'

/** Build a unique display code for a catalog item.
 *  Regular with variant: "No.1-7", TLV: "LV-86h", Premium: "TP.08", etc. */
export function getItemCode(item: { model_number: string; variant?: number | null; series?: string }): string {
  // TLV, Premium, Unlimited, Dream — model_number is already unique
  if (!item.model_number.startsWith('No.') || !item.variant) {
    return item.model_number
  }
  // Regular with variant: "No.1-7"
  return `${item.model_number}-${item.variant}`
}

export interface VehicleAttributes {
  vehicle_category: 'car' | 'truck' | 'bus' | 'emergency' | 'construction' | 'motorcycle' | 'aircraft' | 'boat' | 'train' | 'fantasy'
  body_style: 'sedan' | 'suv' | 'coupe' | 'wagon' | 'van' | 'pickup' | 'convertible' | 'hatchback' | 'cab_over' | 'special'
  primary_color: string
  secondary_color: string | null
  wheel_count: number
  size_class: 'small' | 'medium' | 'large' | 'extra_large'
  features: string[]
  era_style: 'classic' | 'modern' | 'futuristic' | 'retro'
  has_livery: boolean
  window_style: 'standard' | 'none' | 'panoramic' | 'cab'
}

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
  attributes: VehicleAttributes | null
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
