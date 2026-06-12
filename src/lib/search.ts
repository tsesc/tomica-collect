import type { CatalogItem } from './types'
import { translateCarName } from './translate'

/**
 * Multilingual synonym groups for search expansion.
 * Each group contains equivalent terms across languages (EN/JA/ZH-TW/ZH-CN).
 * When a user searches any term in a group, all terms in that group are checked.
 */
const SYNONYM_GROUPS: string[][] = [
  // === Colors ===
  ['red', '紅色', '紅', '红色', '红', 'dark red', 'maroon'],
  ['blue', '藍色', '藍', '蓝色', '蓝', 'light blue', 'navy'],
  ['green', '綠色', '綠', '绿色', '绿', 'dark green', 'light green', 'lime green', 'teal'],
  ['yellow', '黃色', '黃', '黄色', '黄'],
  ['orange', '橙色', '橙', '橘色', '橘'],
  ['white', '白色', '白'],
  ['black', '黑色', '黑'],
  ['silver', '銀色', '銀', '银色', '银', 'chrome'],
  ['gold', '金色', '金', 'bronze', 'copper', 'rose gold'],
  ['gray', 'grey', '灰色', '灰', 'dark grey', 'dark gray'],
  ['pink', '粉紅', '粉色', '粉红'],
  ['purple', '紫色', '紫'],
  ['brown', '棕色', '咖啡色', '褐色', 'tan', 'beige', 'cream', 'ivory'],
  // === Vehicle categories ===
  ['car', '轎車', '轿车', 'sedan'],
  ['suv', 'SUV', '休旅車', '休旅车', '越野車', '越野车'],
  ['coupe', '跑車', '跑车', 'coupé'],
  ['wagon', '旅行車', '旅行车'],
  ['van', '廂型車', '厢型车'],
  ['pickup', '皮卡'],
  ['convertible', '敞篷', '敞篷車', '敞篷车'],
  ['hatchback', '掀背', '掀背車', '掀背车'],
  ['emergency', '緊急', '紧急', '緊急車輛'],
  ['construction', '工程', '工程車', '工程车'],
  ['motorcycle', '機車', '摩托車', '摩托车', '重機'],
  ['train', '列車', '火車', '电车', '列车', '火车'],
  ['fantasy', '造型', '特殊造型'],
  ['truck', 'トラック', '卡車', '卡车'],
  ['bus', 'バス', '巴士', '公車', '公车'],
  // === Body styles ===
  ['cab_over', '平頭', '平头'],
  ['special', '特殊'],
  // === Features ===
  ['wing', '尾翼', '擾流板'],
  ['open_top', '開篷', '开篷'],
  ['ladder', '梯子', '雲梯'],
  ['crane', '起重機', '起重机', '吊車', '吊车'],
  ['trailer', '拖車', '拖车', '掛車'],
  ['police_light', '警燈', '警灯', '警示燈'],
  ['decal', '貼紙', '贴纸', '彩繪', '彩绘'],
  ['antenna', '天線', '天线'],
  ['tank', '油罐', '水箱'],
  ['blade', '刀片', '鏟', '铲'],
  // === Era ===
  ['classic', '經典', '经典', '古典'],
  ['modern', '現代', '现代'],
  ['retro', '復古', '复古'],
  ['futuristic', '未來', '未来'],
  // === Livery ===
  ['livery', '塗裝', '涂装', '彩繪', '彩绘'],
  // === Vehicle subtypes (JA → ZH/EN) ===
  ['patrol', 'パトロール', 'パトカー', '巡邏', '巡逻', '巡邏車'],
  ['police', 'パトロールカー', 'パトカー', '警察', '警車', '警车'],
  ['ambulance', '救急', '救急車', '救護車', '救护车'],
  ['fire', '消防', '消防車', '消防车'],
  ['taxi', 'タクシー', '計程車', '出租车'],
  // === Brands (JA ↔ EN ↔ ZH) — derived from translate.ts patterns ===
  ['toyota', 'トヨタ', '豐田', '丰田'],
  ['nissan', '日産', '日產', 'ニッサン'],
  ['honda', 'ホンダ', '本田'],
  ['mazda', 'マツダ', '馬自達', '马自达'],
  ['subaru', 'スバル', '速霸陸'],
  ['suzuki', 'スズキ', '鈴木', '铃木'],
  ['mitsubishi', '三菱', 'ミツビシ'],
  ['daihatsu', 'ダイハツ', '大發', '大发'],
  ['lexus', 'レクサス', '凌志'],
  ['isuzu', 'いすゞ', 'イスズ', '五十鈴', '五十铃'],
  ['hino', '日野'],
  ['fuso', 'ふそう', 'フソウ', '扶桑'],
  ['bmw', 'BMW', '寶馬', '宝马'],
  ['mercedes', 'メルセデス', '賓士', '奔驰'],
  ['benz', 'ベンツ', 'メルセデス', '賓士', '奔驰'],
  ['audi', 'アウディ', '奧迪', '奥迪'],
  ['volkswagen', 'vw', 'フォルクスワーゲン', '福斯', '大眾', '大众'],
  ['porsche', 'ポルシェ', '保時捷', '保时捷'],
  ['ferrari', 'フェラーリ', '法拉利'],
  ['lamborghini', 'ランボルギーニ', '藍寶堅尼', '兰博基尼'],
  ['maserati', 'マセラティ', '瑪莎拉蒂', '玛莎拉蒂'],
  ['bugatti', 'ブガッティ', '布加迪'],
  ['fiat', 'フィアット', '飛雅特', '菲亚特'],
  ['alfa romeo', 'アルファロメオ', '愛快羅密歐', '阿尔法罗密欧'],
  ['jaguar', 'ジャガー', '捷豹'],
  ['land rover', 'ランドローバー', '路虎'],
  ['lotus', 'ロータス', '蓮花', '路特斯'],
  ['bentley', 'ベントレー', '賓利', '宾利'],
  ['rolls royce', 'ロールスロイス', '勞斯萊斯', '劳斯莱斯'],
  ['aston martin', 'アストンマーティン', '奧斯頓馬丁', '阿斯顿马丁'],
  ['mclaren', 'マクラーレン', '麥拉倫', '迈凯伦'],
  ['peugeot', 'プジョー', '標致', '标致'],
  ['renault', 'ルノー', '雷諾', '雷诺'],
  ['citroen', 'シトロエン', '雪鐵龍', '雪铁龙'],
  ['ford', 'フォード', '福特'],
  ['chevrolet', 'シボレー', '雪佛蘭', '雪佛兰'],
  ['jeep', 'ジープ', '吉普'],
  ['dodge', 'ダッジ', '道奇'],
  ['cadillac', 'キャデラック', '凱迪拉克', '凯迪拉克'],
  ['hummer', 'ハマー', '悍馬', '悍马'],
  ['tesla', 'テスラ', '特斯拉'],
  ['hyundai', 'ヒュンダイ', '現代', '现代'],
  ['kia', 'キア', '起亞', '起亚'],
  ['volvo', 'ボルボ', '富豪', '沃尔沃'],
  ['mini', 'ミニ'],
  ['komatsu', 'コマツ', '小松'],
  // === Common model names ===
  ['skyline', 'スカイライン'],
  ['fairlady', 'フェアレディ'],
  ['gt-r', 'gtr', 'GT-R'],
  ['wrx', 'WRX'],
  ['supra', 'スープラ'],
  ['crown', 'クラウン', '皇冠'],
  ['prius', 'プリウス'],
  ['civic', 'シビック'],
  ['fit', 'フィット'],
  ['jimny', 'ジムニー'],
  ['hiace', 'ハイエース'],
  ['alphard', 'アルファード'],
  ['impreza', 'インプレッサ'],
  ['land cruiser', 'ランドクルーザー', '陸地巡洋艦'],
  ['corolla', 'カローラ'],
  ['camry', 'カムリ'],
  ['roadster', 'ロードスター'],
  ['corvette', 'コルベット'],
  ['mustang', 'マスタング'],
  ['camaro', 'カマロ'],
  ['countach', 'カウンタック'],
  ['wrangler', 'ラングラー'],
  ['model 3', 'モデル 3'],
  ['model s', 'モデル S'],
  ['model x', 'モデル X'],
  ['model y', 'モデル Y'],
]

/** Reverse index: lowercased term → all synonyms in its group */
const synonymIndex = new Map<string, string[]>()
for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    synonymIndex.set(term.toLowerCase(), group)
  }
}

/** Expand a single search token into all synonym variants */
function expandToken(token: string): string[] {
  const lower = token.toLowerCase()
  const result = new Set<string>([lower])
  for (const [key, group] of synonymIndex) {
    if (lower === key || lower.includes(key) || key.includes(lower)) {
      for (const alias of group) result.add(alias.toLowerCase())
    }
  }
  return Array.from(result)
}

/**
 * Build a pre-computed search text for a CatalogItem.
 * Includes all searchable fields + translated brand/model names + attribute values.
 * This string is lowercased and used for substring matching.
 */
export function buildSearchIndex(item: CatalogItem): string {
  const parts: string[] = [
    item.car_name,
    item.model_number,
  ]

  // Add translated names from translate.ts
  const translated = translateCarName(item.car_name, item.manufacturer)
  parts.push(translated.displayName, translated.manufacturer, translated.vehicleType)

  if (item.car_name_en) parts.push(item.car_name_en)
  if (item.car_name_zh_tw) parts.push(item.car_name_zh_tw)
  if (item.car_name_zh_hk) parts.push(item.car_name_zh_hk)
  if (item.car_name_zh_cn) parts.push(item.car_name_zh_cn)
  if (item.manufacturer) parts.push(item.manufacturer)

  // Add all attribute values
  const attr = item.attributes
  if (attr) {
    parts.push(
      attr.vehicle_category,
      attr.body_style,
      attr.primary_color,
      attr.secondary_color ?? '',
      attr.era_style,
      attr.window_style,
      attr.size_class,
      attr.has_livery ? 'livery' : '',
      ...(attr.features ?? []),
    )
  }

  return parts.filter(Boolean).join(' ').toLowerCase()
}

/**
 * Test whether a CatalogItem matches a search query.
 * Supports multi-token AND queries: "紅色 豐田" requires both to match.
 * Each token is expanded through multilingual synonyms.
 */
export function matchesSearch(searchIndex: string, query: string): boolean {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true

  return tokens.every(token => {
    const expanded = expandToken(token)
    return expanded.some(variant => searchIndex.includes(variant))
  })
}
