import { createClient } from '@supabase/supabase-js'

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context

  try {
    // Auth: verify JWT
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }

    const { ai_provider, api_key } = (await request.json()) as any

    // Validate ai_provider
    const validProviders = ['openai', 'gemini', 'claude']
    if (!ai_provider || !validProviders.includes(ai_provider)) {
      return new Response(JSON.stringify({ error: 'Invalid AI provider' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Validate api_key
    if (!api_key || typeof api_key !== 'string' || api_key.length > 500) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Use verified user.id, never trust client-provided user_id
    const { error } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      ai_provider,
      api_keys: { [ai_provider]: api_key },
      updated_at: new Date().toISOString(),
    })

    if (error) {
      console.error('settings upsert error:', error)
      return new Response(JSON.stringify({ error: 'Failed to save settings' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('settings error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
