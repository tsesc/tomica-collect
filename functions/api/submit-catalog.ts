import { createClient } from '@supabase/supabase-js'

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

const ALLOWED_SERIES = new Set([
  'regular', 'premium', 'premium_unlimited', 'limited_vintage',
  'dream', 'fandom', 'disney', 'cars', 'giftset', 'town', 'unlimited',
])

const ALLOWED_VEHICLE_CATEGORIES = new Set([
  'car', 'truck', 'bus', 'emergency', 'construction',
  'motorcycle', 'aircraft', 'boat', 'train', 'fantasy',
])

const ALLOWED_BODY_STYLES = new Set([
  'sedan', 'suv', 'coupe', 'wagon', 'van', 'pickup',
  'convertible', 'hatchback', 'cab_over', 'special',
])

const RATE_LIMIT_PER_DAY = 10
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

interface SubmitRequest {
  car_name: string
  series: string
  model_number?: string
  manufacturer?: string
  primary_color?: string
  secondary_color?: string
  vehicle_category?: string
  body_style?: string
  release_year?: number
  notes?: string
  image_base64: string
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function decodeDataUri(dataUri: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(dataUri)
  if (!m) return null
  const mime = m[1].toLowerCase().replace('jpg', 'jpeg')
  const binary = atob(m[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { bytes, mime }
}

function extFromMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context

  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const body = (await request.json()) as SubmitRequest

    const carName = (body.car_name ?? '').trim()
    const series = (body.series ?? '').trim()
    if (!carName || carName.length < 2 || carName.length > 200) {
      return jsonResponse({ error: '車名長度需介於 2–200 字元' }, 400)
    }
    if (!ALLOWED_SERIES.has(series)) {
      return jsonResponse({ error: '無效的系列' }, 400)
    }
    const modelNumber = (body.model_number ?? '').trim() ||
      `USR:${user.id.slice(0, 8)}-${Date.now().toString(36)}`
    if (modelNumber.length > 60) {
      return jsonResponse({ error: '型號過長' }, 400)
    }
    if (body.vehicle_category && !ALLOWED_VEHICLE_CATEGORIES.has(body.vehicle_category)) {
      return jsonResponse({ error: '無效的車型' }, 400)
    }
    if (body.body_style && !ALLOWED_BODY_STYLES.has(body.body_style)) {
      return jsonResponse({ error: '無效的車身樣式' }, 400)
    }

    if (!body.image_base64 || body.image_base64.length > MAX_IMAGE_BYTES * 2) {
      return jsonResponse({ error: '圖片過大或缺失' }, 400)
    }
    const decoded = decodeDataUri(body.image_base64)
    if (!decoded) {
      return jsonResponse({ error: '圖片格式錯誤（需 jpeg/png/webp）' }, 400)
    }
    if (decoded.bytes.length > MAX_IMAGE_BYTES) {
      return jsonResponse({ error: '圖片需小於 5MB' }, 400)
    }

    const imageHash = await sha256Hex(decoded.bytes)

    const { data: existingByHash } = await supabase
      .from('tomica_catalog')
      .select('*')
      .eq('image_hash', imageHash)
      .limit(1)
      .maybeSingle()
    if (existingByHash) {
      return jsonResponse(
        { item: existingByHash, duplicate: true, reason: 'image_already_submitted' },
        200
      )
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('tomica_catalog')
      .select('id', { count: 'exact', head: true })
      .eq('submitted_by', user.id)
      .gte('created_at', since)
    if ((count ?? 0) >= RATE_LIMIT_PER_DAY) {
      return jsonResponse({ error: `每日最多貢獻 ${RATE_LIMIT_PER_DAY} 筆，請明天再試` }, 429)
    }

    const ext = extFromMime(decoded.mime)
    const path = `${user.id}/${imageHash}.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from('user-catalog-images')
      .upload(path, decoded.bytes, {
        contentType: decoded.mime,
        upsert: true,
      })
    if (uploadErr) {
      console.error('upload error:', uploadErr.message)
      return jsonResponse({ error: '圖片上傳失敗' }, 500)
    }
    const { data: pub } = supabase.storage
      .from('user-catalog-images')
      .getPublicUrl(path)
    const imageUrl = pub.publicUrl

    const attributes: Record<string, unknown> = {}
    if (body.vehicle_category) attributes.vehicle_category = body.vehicle_category
    if (body.body_style) attributes.body_style = body.body_style
    if (body.primary_color) attributes.primary_color = body.primary_color.toLowerCase()
    if (body.secondary_color) attributes.secondary_color = body.secondary_color.toLowerCase()

    const releaseStart = body.release_year && body.release_year >= 1970 && body.release_year <= 2099
      ? `${body.release_year}-01`
      : null

    const { data: inserted, error: insertErr } = await supabase
      .from('tomica_catalog')
      .insert({
        model_number: modelNumber,
        car_name: carName,
        series,
        manufacturer: body.manufacturer?.trim() || null,
        body_color: body.primary_color ? [body.primary_color.toLowerCase()] : [],
        image_url: imageUrl,
        image_hash: imageHash,
        source: 'user',
        attributes: Object.keys(attributes).length > 0 ? attributes : null,
        release_start: releaseStart,
        submitted_by: user.id,
        verified: false,
        submission_status: 'user',
        submission_notes: body.notes?.trim() || null,
        metadata: { submitted_at: new Date().toISOString() },
      })
      .select()
      .single()

    if (insertErr || !inserted) {
      console.error('insert error:', insertErr?.message)
      return jsonResponse({ error: '建立條目失敗' }, 500)
    }

    return jsonResponse({ item: inserted, duplicate: false }, 201)
  } catch (err) {
    console.error('submit-catalog error:', err instanceof Error ? err.message : String(err))
    return jsonResponse({ error: '伺服器錯誤，請稍後再試' }, 500)
  }
}
