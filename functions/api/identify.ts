import { createClient } from '@supabase/supabase-js'

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

interface IdentifyRequest {
  image_base64: string
  user_id: string
  ai_provider: 'openai' | 'gemini' | 'claude'
}

const STAGE1_PROMPT = `你是 Tomica 小汽車鑑定專家。請先判斷這張圖片屬於以下哪種情況：
1. 盒裝正面（可見包裝盒、編號、車名）
2. 盒裝背面（可見規格資訊）
3. 散車車體（無包裝，只有車體）
4. 底盤特寫（可見底部刻字）
5. 其他/無法辨識

回傳 JSON: { "type": 1-5, "confidence": 0-1 }`

const BOX_PROMPT = `你是 Tomica 小汽車鑑定專家。請從這張 Tomica 包裝圖片中提取以下資訊。逐項回答，無法辨識的欄位填 null。

1. series — 非常重要！請根據盒子外觀判斷：
   - 紅色盒子 = "トミカ"（常規系列）
   - 黑色盒子 = "トミカプレミアム"（Premium系列）
   - 藍色盒子 = "Dream TOMICA"
   - "LIMITED VINTAGE" 字樣 = "トミカリミテッドヴィンテージ"
2. model_number — 盒子上的數字編號。
   - 常規系列格式: "No.23"
   - Premium系列格式: 直接數字如 "15"（不帶No.前綴）
   - 請完整回傳盒上看到的編號
3. car_name — 車名（日文或英文，如 "NISSAN FAIRLADY Z (Z31)"）
4. is_first_edition — 是否為初回特別仕樣（盒子是否有金色/特殊標示）
5. manufacturer — 製造商品牌（如 Toyota, Nissan, BMW）
6. primary_color — 車體主色（英文: red, blue, white, black, silver, yellow, green, orange, gold, gray, brown, pink, purple）
7. secondary_color — 車體副色（同上格式，無則 null）
8. vehicle_category — 從以下選一: car, truck, bus, emergency, construction, motorcycle, aircraft, boat, train, fantasy
9. body_style — 從以下選一: sedan, suv, coupe, wagon, van, pickup, convertible, hatchback, cab_over, special
10. top_guesses — 如果看不清編號，給出 3 個最可能的車款猜測（日文車名）

回傳 JSON: { "model_number": string|null, "car_name": string|null, "series": string|null, "is_first_edition": boolean|null, "manufacturer": string|null, "primary_color": string|null, "secondary_color": string|null, "vehicle_category": string|null, "body_style": string|null, "top_guesses": string[] }`

const LOOSE_PROMPT = `你是 Tomica 小汽車鑑定專家。這是一台 Tomica 小汽車（可能沒有包裝）。請仔細觀察並提取以下特徵，盡量填寫所有欄位。

1. manufacturer — 製造商品牌（如 Toyota, Nissan, Honda, BMW, Mercedes-Benz, Subaru, Mitsubishi, Suzuki, Lamborghini 等）
2. car_name — 最可能的車款全名（日文或英文，如 "NISSAN GT-R NISMO", "TOYOTA CROWN"）。如果不確定具體型號，寫出你最有信心的猜測
3. model_number — 如果能看到底盤或車身上的 Tomica 編號（如 No.23, LV-N169a），請提取
4. series — 從外觀推測的 Tomica 系列："トミカ"(常規), "トミカプレミアム"(Premium), "トミカリミテッドヴィンテージ"(TLV), "Dream TOMICA"
5. vehicle_category — 必填，從以下選一: car, truck, bus, emergency, construction, motorcycle, aircraft, boat, train, fantasy
6. body_style — 必填，從以下選一: sedan, suv, coupe, wagon, van, pickup, convertible, hatchback, cab_over, special
7. primary_color — 必填，車體主色（用英文: red, blue, white, black, silver, yellow, green, orange, gold, gray, brown, pink, purple, beige, navy, cream）
8. secondary_color — 車體副色（同上格式，無則 null）
9. size_class — 車體大小: small, medium, large, extra_large
10. era_style — 年代風格: classic, modern, futuristic, retro
11. features — 特殊配件列表，從以下選取: police_light, ladder, wing, blade, crane, antenna, decal, open_top, tank, trailer, bucket, hose, plow, box_body, flatbed, drill
12. has_livery — 是否有特殊塗裝/貼紙圖案: true/false
13. markings — 車體上可見的文字或標誌
14. chassis_text — 底盤刻字（若可見）
15. top_guesses — 給出你最有信心的 3 個可能車款名稱猜測（日文），按信心排序

回傳 JSON: { "manufacturer": string|null, "car_name": string|null, "model_number": string|null, "series": string|null, "vehicle_category": string, "body_style": string, "primary_color": string, "secondary_color": string|null, "size_class": string, "era_style": string, "features": string[], "has_livery": boolean, "markings": string|null, "chassis_text": string|null, "top_guesses": string[] }`

function getStage2Prompt(inputType: number): string {
  return inputType <= 2 ? BOX_PROMPT : LOOSE_PROMPT
}

async function callOpenAI(apiKey: string, prompt: string, imageBase64: string): Promise<string> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageBase64 } }] }],
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    }),
  })
  if (!resp.ok) {
    const errBody = await resp.text()
    throw new Error(`OpenAI API ${resp.status}: ${errBody.slice(0, 200)}`)
  }
  const data = await resp.json() as any
  if (!data.choices?.[0]?.message?.content) {
    throw new Error(`OpenAI empty response: ${JSON.stringify(data).slice(0, 200)}`)
  }
  return data.choices[0].message.content
}

async function callGemini(apiKey: string, prompt: string, imageBase64: string): Promise<string> {
  const base64Data = imageBase64.replace(/^data:image\/[^;]+;base64,/, '')
  const mimeMatch = imageBase64.match(/^data:(image\/[^;]+);/)
  const mimeType = mimeMatch?.[1] ?? 'image/jpeg'
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  )
  if (!resp.ok) {
    const errBody = await resp.text()
    throw new Error(`Gemini API ${resp.status}: ${errBody.slice(0, 200)}`)
  }
  const data = await resp.json() as any
  if (data.error) {
    throw new Error(`Gemini error: ${data.error.message ?? JSON.stringify(data.error)}`)
  }
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error(`Gemini empty response: ${JSON.stringify(data).slice(0, 200)}`)
  }
  return data.candidates[0].content.parts[0].text
}

async function callClaude(apiKey: string, prompt: string, imageBase64: string): Promise<string> {
  const base64Data = imageBase64.replace(/^data:image\/[^;]+;base64,/, '')
  const mimeMatch = imageBase64.match(/^data:(image\/[^;]+);/)
  const mimeType = mimeMatch?.[1] ?? 'image/jpeg'
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } }, { type: 'text', text: prompt }] }],
    }),
  })
  if (!resp.ok) {
    const errBody = await resp.text()
    throw new Error(`Claude API ${resp.status}: ${errBody.slice(0, 200)}`)
  }
  const data = await resp.json() as any
  if (!data.content?.[0]?.text) {
    throw new Error(`Claude empty response: ${JSON.stringify(data).slice(0, 200)}`)
  }
  return data.content[0].text
}

async function callAI(provider: string, apiKey: string, prompt: string, imageBase64: string): Promise<string> {
  switch (provider) {
    case 'openai': return callOpenAI(apiKey, prompt, imageBase64)
    case 'gemini': return callGemini(apiKey, prompt, imageBase64)
    case 'claude': return callClaude(apiKey, prompt, imageBase64)
    default: throw new Error(`Unknown provider: ${provider}`)
  }
}

/** Map AI-extracted series text → DB series value */
const SERIES_MAP: Record<string, string> = {
  'トミカ': 'regular',
  'tomica': 'regular',
  'トミカプレミアム': 'premium',
  'tomica premium': 'premium',
  'premium': 'premium',
  'プレミアム': 'premium',
  'プレミアムアンリミテッド': 'premium_unlimited',
  'premium unlimited': 'premium_unlimited',
  'トミカリミテッドヴィンテージ': 'limited_vintage',
  'limited vintage': 'limited_vintage',
  'tlv': 'limited_vintage',
  'dream tomica': 'dream',
  'dream': 'dream',
  'ドリームトミカ': 'dream',
}

function normalizeSeries(raw: string | null | undefined): string | null {
  if (!raw) return null
  const key = raw.toLowerCase().trim()
  return SERIES_MAP[key] ?? null
}

/** Normalize model number for flexible matching */
function normalizeModelNum(mn: string): string {
  return mn.replace(/\s/g, '').replace(/^(No\.|TP\.|LV-?|TLV-?)/i, '').toLowerCase()
}

export function matchCandidates(
  features: Record<string, unknown>,
  catalog: Array<Record<string, unknown>>
): Array<{ item: Record<string, unknown>; score: number; reasons: string[] }> {
  const modelNumber = features.model_number as string | null
  const featureSeries = normalizeSeries(features.series as string | null)

  // If we have a model number, try exact match (series-aware)
  if (modelNumber) {
    const normNum = normalizeModelNum(modelNumber)
    let exact = catalog.filter((c) => normalizeModelNum(c.model_number as string) === normNum)

    // If series is known, narrow down; if multiple matches remain, prefer series match
    if (exact.length > 1 && featureSeries) {
      const seriesFiltered = exact.filter((c) => c.series === featureSeries)
      if (seriesFiltered.length > 0) exact = seriesFiltered
    }

    if (exact.length > 0) {
      // Only give 0.99 if series also matches or is unknown
      const score = (featureSeries && exact[0].series !== featureSeries) ? 0.85 : 0.99
      return exact.map((item) => ({
        item,
        score,
        reasons: [`Model number match: ${item.model_number}${featureSeries ? ` (${featureSeries})` : ''}`],
      }))
    }
  }

  // Fuzzy matching with series bonus
  return catalog
    .map((item) => {
      let score = 0
      const reasons: string[] = []
      const attrs = item.attributes as Record<string, unknown> | null

      // Series match bonus (0.15) — or penalty (-0.20) for mismatch
      if (featureSeries) {
        if (item.series === featureSeries) {
          score += 0.15
          reasons.push(`Series: ${featureSeries}`)
        } else {
          score -= 0.20
        }
      }

      // Manufacturer match (0.20)
      const fm = ((features.manufacturer as string) ?? '').toLowerCase()
      const im = ((item.manufacturer as string) ?? '').toLowerCase()
      const iname = ((item.car_name as string) ?? '').toLowerCase()
      if (fm && (im.includes(fm) || iname.includes(fm))) { score += 0.20; reasons.push(`Manufacturer: ${fm}`) }

      // Car name match (0.30)
      const fn = ((features.car_name as string) ?? '').toLowerCase()
      const inameEn = ((item.car_name_en as string) ?? '').toLowerCase()
      if (fn) {
        // Full match
        if (iname.includes(fn) || inameEn.includes(fn)) {
          score += 0.30; reasons.push(`Name: ${item.car_name}`)
        } else {
          // Partial: check individual words (at least 2 chars each)
          const words = fn.split(/[\s・]+/).filter(w => w.length >= 2)
          const matchedWords = words.filter(w => iname.includes(w) || inameEn.includes(w))
          if (matchedWords.length > 0) {
            const partial = 0.30 * (matchedWords.length / words.length)
            score += partial
            reasons.push(`Partial name: ${matchedWords.join(', ')}`)
          }
        }
      }

      if (attrs) {
        // Primary color match (0.15)
        const fColor = ((features.primary_color as string) ?? (features.body_color as string) ?? '').toLowerCase()
        const iColor = ((attrs.primary_color as string) ?? '').toLowerCase()
        const iColor2 = ((attrs.secondary_color as string) ?? '').toLowerCase()
        if (fColor && (iColor.includes(fColor) || fColor.includes(iColor) || iColor2.includes(fColor))) {
          score += 0.15; reasons.push(`Color: ${iColor}`)
        }

        // Vehicle category match (0.10)
        const fCat = ((features.vehicle_category as string) ?? (features.vehicle_type as string) ?? '').toLowerCase()
        const iCat = ((attrs.vehicle_category as string) ?? '').toLowerCase()
        if (fCat && iCat && fCat === iCat) { score += 0.10; reasons.push(`Category: ${iCat}`) }

        // Body style match (0.08)
        const fStyle = ((features.body_style as string) ?? '').toLowerCase()
        const iStyle = ((attrs.body_style as string) ?? '').toLowerCase()
        if (fStyle && iStyle && fStyle === iStyle) { score += 0.08; reasons.push(`Style: ${iStyle}`) }

        // Features overlap (0.10)
        const fFeats = (features.features as string[]) ?? []
        const iFeats = (attrs.features as string[]) ?? []
        if (fFeats.length > 0 && iFeats.length > 0) {
          const overlap = fFeats.filter((f: string) => iFeats.includes(f))
          if (overlap.length > 0) { score += 0.10; reasons.push(`Features: ${overlap.join(', ')}`) }
        }

        // Size class match (0.05)
        const fSize = ((features.size_class as string) ?? '').toLowerCase()
        const iSize = ((attrs.size_class as string) ?? '').toLowerCase()
        if (fSize && iSize && fSize === iSize) { score += 0.05; reasons.push(`Size: ${iSize}`) }

        // Era style match (0.02)
        const fEra = ((features.era_style as string) ?? '').toLowerCase()
        const iEra = ((attrs.era_style as string) ?? '').toLowerCase()
        if (fEra && iEra && fEra === iEra) { score += 0.02; reasons.push(`Era: ${iEra}`) }
      } else {
        // Fallback for items without attributes
        const fc = ((features.body_color as string) ?? '').toLowerCase()
        const ic = ((item.body_color as string[]) ?? []).map((c: string) => c.toLowerCase())
        if (fc && ic.some((c: string) => c.includes(fc) || fc.includes(c))) { score += 0.15; reasons.push(`Color: ${ic.join(', ')}`) }

        const ft = ((features.vehicle_type as string) ?? '').toLowerCase()
        const it2 = ((item.vehicle_type as string) ?? '').toLowerCase()
        if (ft && it2 && ft === it2) { score += 0.10; reasons.push(`Type: ${item.vehicle_type}`) }
      }

      return { item, score: Math.max(0, score), reasons }
    })
    .filter((r) => r.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context

  try {
    // Auth: verify JWT from Authorization header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    const anonClient = createClient(env.SUPABASE_URL, authHeader.replace('Bearer ', ''))
    const { data: { user }, error: authError } = await createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ).auth.getUser(authHeader.replace('Bearer ', ''))

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    const { image_base64, ai_provider } = (await request.json()) as Omit<IdentifyRequest, 'user_id'>
    const user_id = user.id // Use verified user ID, never trust client

    // Validate ai_provider
    const validProviders = ['openai', 'gemini', 'claude']
    if (!validProviders.includes(ai_provider)) {
      return new Response(JSON.stringify({ error: 'Invalid AI provider' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Validate image_base64 size (max 10MB)
    if (!image_base64 || image_base64.length > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Image too large or missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { data: settings } = await supabase.from('user_settings').select('api_keys').eq('user_id', user_id).single()
    if (!settings?.api_keys?.[ai_provider]) {
      return new Response(JSON.stringify({ error: `No API key configured for ${ai_provider}` }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const apiKey = settings.api_keys[ai_provider]

    // Stage 1: Scene classification
    const stage1Raw = await callAI(ai_provider, apiKey, STAGE1_PROMPT, image_base64)
    const stage1 = JSON.parse(stage1Raw)

    // Stage 2: Feature extraction
    const stage2Prompt = getStage2Prompt(stage1.type)
    const stage2Raw = await callAI(ai_provider, apiKey, stage2Prompt, image_base64)
    const features = JSON.parse(stage2Raw)

    // Stage 3: Database matching
    const { data: catalog } = await supabase.from('tomica_catalog').select('*')
    let candidates = matchCandidates(features, catalog ?? [])

    // Fallback: if few candidates, use top_guesses from AI for name matching
    if (candidates.length < 3 && features.top_guesses?.length > 0) {
      const existingIds = new Set(candidates.map((c) => c.item.id as string))
      for (const guess of features.top_guesses as string[]) {
        const guessLower = guess.toLowerCase()
        const guessMatches = (catalog ?? [])
          .filter((c) => !existingIds.has(c.id as string))
          .filter((c) => {
            const name = ((c.car_name as string) ?? '').toLowerCase()
            const nameEn = ((c.car_name_en as string) ?? '').toLowerCase()
            return name.includes(guessLower) || guessLower.includes(name) ||
              nameEn.includes(guessLower) || guessLower.includes(nameEn) ||
              guessLower.split(/[\s・]+/).filter(w => w.length >= 2).some(w => name.includes(w) || nameEn.includes(w))
          })
          .slice(0, 2)
          .map((item) => ({ item, score: 0.15, reasons: [`AI guess: ${guess}`] }))
        candidates = [...candidates, ...guessMatches]
        guessMatches.forEach((m) => existingIds.add(m.item.id as string))
      }
      candidates = candidates.slice(0, 10)
    }

    const inputTypes = ['', 'box_front', 'box_back', 'loose', 'chassis', 'other']

    // Log recognition
    await supabase.from('recognition_log').insert({
      user_id,
      input_type: inputTypes[stage1.type] ?? 'other',
      ai_provider,
      raw_response: { stage1, features },
      candidates: candidates.map((c) => ({ catalog_id: c.item.id, score: c.score, reasons: c.reasons })),
    })

    return new Response(
      JSON.stringify({
        input_type: inputTypes[stage1.type] ?? 'other',
        candidates: candidates.map((c) => ({ catalog_item: c.item, score: c.score, match_reasons: c.reasons })),
        raw_features: features,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('identify error:', errMsg, err)
    return new Response(
      JSON.stringify({ error: `Recognition failed: ${errMsg}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
