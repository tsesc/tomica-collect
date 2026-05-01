/** Shared display lookup maps for color, attribute, and series translations */

export const COLOR_ZH: Record<string, string> = {
  white: '白色', black: '黑色', red: '紅色', blue: '藍色', silver: '銀色',
  yellow: '黃色', green: '綠色', orange: '橙色', gold: '金色', gray: '灰色',
  grey: '灰色', brown: '棕色', pink: '粉紅', purple: '紫色', beige: '米色',
  navy: '深藍', cream: '奶油色', chrome: '鍍鉻', copper: '銅色', maroon: '栗色',
}

export const COLOR_HEX: Record<string, string> = {
  white: '#F9FAFB', black: '#1F2937', red: '#DC2626', blue: '#2563EB',
  silver: '#9CA3AF', yellow: '#EAB308', green: '#16A34A', orange: '#EA580C',
  gold: '#D97706', gray: '#6B7280', grey: '#6B7280', brown: '#92400E',
  pink: '#EC4899', purple: '#7C3AED', beige: '#D2B48C', navy: '#1E3A5F',
  cream: '#FFFDD0', chrome: '#C0C0C0', copper: '#B87333', maroon: '#800000',
}

export function colorToZh(c: string): string { return COLOR_ZH[c.toLowerCase()] ?? c }
export function colorToHex(c: string): string { return COLOR_HEX[c.toLowerCase()] ?? c }

export const CATEGORY_ZH: Record<string, string> = {
  car: '轎車', truck: '卡車', bus: '巴士', emergency: '緊急車輛',
  construction: '工程車', motorcycle: '機車', aircraft: '飛機',
  boat: '船', train: '列車', fantasy: '造型車',
}

export const BODY_STYLE_ZH: Record<string, string> = {
  sedan: '四門轎車', suv: 'SUV', coupe: '雙門跑車', wagon: '旅行車',
  van: '箱型車', pickup: '皮卡', convertible: '敞篷', hatchback: '掀背',
  cab_over: '平頭車', special: '特殊',
}

export const SIZE_ZH: Record<string, string> = {
  small: '小型', medium: '中型', large: '大型', extra_large: '超大型',
}

export const ERA_ZH: Record<string, string> = {
  classic: '經典', modern: '現代', futuristic: '未來', retro: '復古',
}

export const WINDOW_ZH: Record<string, string> = {
  standard: '標準', none: '無', panoramic: '全景', cab: '駕駛室',
}

export const FEATURE_ZH: Record<string, string> = {
  police_light: '🚨 警燈', ladder: '🪜 梯子', wing: '翼', blade: '刀片',
  crane: '🏗️ 吊臂', antenna: '📡 天線', decal: '🎨 貼紙', open_top: '☀️ 開頂',
  tank: '🛢️ 油罐', trailer: '🚛 拖車', bucket: '🪣 鏟斗', hose: '🔧 管線',
  plow: '除雪鏟', box_body: '📦 箱體', flatbed: '平板', drill: '🔩 鑽頭',
}

export const SERIES_ZH: Record<string, string> = {
  regular: '常規', premium: 'Premium', premium_unlimited: 'Premium Unlimited',
  limited_vintage: 'Limited Vintage', dream: 'Dream',
}
