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
1. 型號編號（盒子左上角或右上角的數字，如 "No.23"）
2. 車名（日文或英文車名，如 "日産 GT-R"）
3. 系列名稱（如 "トミカ", "トミカプレミアム", "Dream TOMICA"）
4. 是否為初回特別仕樣（盒子是否有金色/特殊標示）
5. 車體顏色
6. 製造商品牌（如 Toyota, Nissan, BMW）
回傳 JSON: { "model_number": string|null, "car_name": string|null, "series": string|null, "is_first_edition": boolean|null, "body_color": string|null, "manufacturer": string|null }`

const LOOSE_PROMPT = `你是 Tomica 小汽車鑑定專家。這是一台沒有包裝的 Tomica 小汽車。請仔細觀察並提取以下特徵：
1. 車型類別（轎車/SUV/卡車/巴士/工程車/跑車/其他）
2. 車體顏色（主色 + 副色）
3. 製造商品牌
4. 可能的車款名稱
5. 車體上的文字或標誌
6. 底盤刻字（若可見）
7. 特殊特徵
回傳 JSON: { "vehicle_type": string|null, "body_color": string|null, "manufacturer": string|null, "car_name": string|null, "markings": string|null, "chassis_text": string|null, "special_features": string|null }`

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

export function matchCandidates(
  features: Record<string, unknown>,
  catalog: Array<Record<string, unknown>>
): Array<{ item: Record<string, unknown>; score: number; reasons: string[] }> {
  const modelNumber = features.model_number as string | null
  if (modelNumber) {
    const exact = catalog.filter((c) => (c.model_number as string).replace(/\s/g, '') === modelNumber.replace(/\s/g, ''))
    if (exact.length > 0) return exact.map((item) => ({ item, score: 0.99, reasons: ['Exact model number match'] }))
  }
  return catalog
    .map((item) => {
      let score = 0
      const reasons: string[] = []
      const attrs = item.attributes as Record<string, unknown> | null

      // Manufacturer match (0.20)
      const fm = ((features.manufacturer as string) ?? '').toLowerCase()
      const im = ((item.manufacturer as string) ?? '').toLowerCase()
      if (fm && im && im.includes(fm)) { score += 0.20; reasons.push(`Manufacturer: ${item.manufacturer}`) }

      // Car name match (0.30)
      const fn = ((features.car_name as string) ?? '').toLowerCase()
      const iname = ((item.car_name as string) ?? '').toLowerCase()
      const inameEn = ((item.car_name_en as string) ?? '').toLowerCase()
      if (fn && (iname.includes(fn) || inameEn.includes(fn))) { score += 0.30; reasons.push(`Name: ${item.car_name}`) }

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

      return { item, score, reasons }
    })
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
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
    const candidates = matchCandidates(features, catalog ?? [])

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
