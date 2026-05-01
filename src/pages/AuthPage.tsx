import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" className="w-4 h-4" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

export function AuthPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (isSignUp) {
        await signUp(email, password)
      } else {
        await signIn(email, password)
      }
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
      // Browser will redirect to Google; component will unmount.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google 登入失敗')
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display font-bold text-2xl text-primary text-center mb-8">
          Tomica<span className="font-light text-on-surface">Collect</span>
        </h1>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-2.5 py-3 rounded-full bg-white border border-outline-variant/40 text-on-surface font-semibold text-sm shadow-sm hover:bg-surface-container-low transition-colors disabled:opacity-50 mb-4"
        >
          <GoogleIcon />
          <span>{googleLoading ? '正在前往 Google⋯' : '使用 Google 帳號繼續'}</span>
        </button>

        <div className="flex items-center gap-2 my-4 text-[11px] text-on-surface-variant/70 uppercase tracking-wider">
          <div className="flex-1 h-px bg-outline-variant/30" />
          <span>或</span>
          <div className="flex-1 h-px bg-outline-variant/30" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full px-4 py-3 rounded-xl bg-surface-container-low text-on-surface placeholder-on-surface-variant text-sm outline-none focus:ring-2 focus:ring-primary" />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
            className="w-full px-4 py-3 rounded-xl bg-surface-container-low text-on-surface placeholder-on-surface-variant text-sm outline-none focus:ring-2 focus:ring-primary" />
          {error && <p className="text-error text-sm">{error}</p>}
          <button type="submit" disabled={loading || googleLoading}
            className="w-full py-3 rounded-full bg-gradient-to-br from-primary-container to-primary-dark text-white font-display font-semibold text-sm disabled:opacity-50">
            {loading ? '處理中...' : isSignUp ? '註冊' : '登入'}
          </button>
          <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="w-full text-center text-sm text-primary">
            {isSignUp ? '已有帳號？登入' : '沒有帳號？註冊'}
          </button>
        </form>
      </div>
    </div>
  )
}
