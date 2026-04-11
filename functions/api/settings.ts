import { createClient } from '@supabase/supabase-js'

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context

  try {
    const { user_id, ai_provider, api_key } = (await request.json()) as any
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

    const { error } = await supabase.from('user_settings').upsert({
      user_id,
      ai_provider,
      api_keys: { [ai_provider]: api_key },
      updated_at: new Date().toISOString(),
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
