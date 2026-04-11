import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'

export function AuthPage() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display font-bold text-2xl text-primary text-center mb-8">
          Tomica<span className="font-light text-on-surface">Collect</span>
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full px-4 py-3 rounded-xl bg-surface-container-low text-on-surface placeholder-on-surface-variant text-sm outline-none focus:ring-2 focus:ring-primary" />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
            className="w-full px-4 py-3 rounded-xl bg-surface-container-low text-on-surface placeholder-on-surface-variant text-sm outline-none focus:ring-2 focus:ring-primary" />
          {error && <p className="text-error text-sm">{error}</p>}
          <button type="submit" disabled={loading}
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
