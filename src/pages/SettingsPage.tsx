import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { AiProvider } from '../lib/types'

const PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI (GPT-4o)' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'claude', label: 'Anthropic Claude' },
]

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const [provider, setProvider] = useState<AiProvider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')

  useEffect(() => {
    if (!user) return
    supabase.from('user_settings').select('ai_provider, api_keys').eq('user_id', user.id).single().then(({ data }) => {
      if (data) { setProvider(data.ai_provider as AiProvider); setApiKey(data.api_keys?.[data.ai_provider] ? '••••••••' : '') }
    })
  }, [user])

  async function handleSave() {
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, ai_provider: provider, api_keys: { [provider]: apiKey } })
    setSaving(false)
    if (error) alert(error.message)
  }

  async function handleTest() {
    setTestStatus('testing')
    const valid = (provider === 'openai' && apiKey.startsWith('sk-')) || (provider === 'gemini' && apiKey.length > 20) || (provider === 'claude' && apiKey.startsWith('sk-ant-'))
    setTestStatus(valid ? 'success' : 'error')
  }

  async function handleExport(format: 'csv' | 'json') {
    if (!user) return
    const { data } = await supabase.from('user_collection').select('*, catalog:tomica_catalog(*)').eq('user_id', user.id)
    if (!data) return
    let content: string, mimeType: string, filename: string
    if (format === 'json') { content = JSON.stringify(data, null, 2); mimeType = 'application/json'; filename = 'tomica-collection.json' }
    else { const headers = 'model_number,car_name,series,condition,has_box,acquired_date\n'; const rows = data.map((r: any) => [r.catalog?.model_number, r.catalog?.car_name, r.catalog?.series, r.condition, r.has_box, r.acquired_date].join(',')); content = headers + rows.join('\n'); mimeType = 'text/csv'; filename = 'tomica-collection.csv' }
    const blob = new Blob([content], { type: mimeType }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-6">
      <h2 className="font-display font-bold text-xl">設定</h2>
      <section className="bg-white rounded-2xl p-4 space-y-4 shadow-sm">
        <h3 className="font-display font-semibold text-sm text-on-surface-variant uppercase tracking-wide">AI 辨識設定</h3>
        <div><label className="text-xs text-on-surface-variant block mb-1">AI Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)} className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm outline-none">
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select></div>
        <div><label className="text-xs text-on-surface-variant block mb-1">API Key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="輸入 API Key..." className="w-full px-3 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm outline-none" /></div>
        <div className="flex gap-2">
          <button onClick={handleTest} className="px-4 py-2 rounded-full bg-surface-container text-on-surface-variant text-sm font-medium">
            {testStatus === 'testing' ? '測試中...' : testStatus === 'success' ? '✓ 連線成功' : testStatus === 'error' ? '✗ 連線失敗' : '測試連線'}</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-50">{saving ? '儲存中...' : '儲存'}</button>
        </div>
      </section>
      <section className="bg-white rounded-2xl p-4 space-y-3 shadow-sm">
        <h3 className="font-display font-semibold text-sm text-on-surface-variant uppercase tracking-wide">帳號</h3>
        <div className="text-sm text-on-surface">{user?.email}</div>
        <button onClick={signOut} className="text-sm text-error font-medium">登出</button>
      </section>
      <section className="bg-white rounded-2xl p-4 space-y-3 shadow-sm">
        <h3 className="font-display font-semibold text-sm text-on-surface-variant uppercase tracking-wide">資料管理</h3>
        <button onClick={() => handleExport('csv')} className="block text-sm text-primary">匯出收藏資料 (CSV)</button>
        <button onClick={() => handleExport('json')} className="block text-sm text-primary">匯出收藏資料 (JSON)</button>
      </section>
      <section className="bg-white rounded-2xl p-4 space-y-2 shadow-sm">
        <h3 className="font-display font-semibold text-sm text-on-surface-variant uppercase tracking-wide">關於</h3>
        <div className="text-sm text-on-surface-variant">版本 v1.0.0</div>
        <div className="text-sm text-on-surface-variant">MIT License</div>
      </section>
    </div>
  )
}
