import { Link } from 'react-router-dom'

export function TopNav() {
  return (
    <header className="h-14 bg-primary-container flex items-center justify-between px-6">
      <Link to="/" className="text-white font-display font-bold text-lg tracking-tight">
        Tomica<span className="font-light opacity-85">Collect</span>
      </Link>
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="搜尋型號、車名..."
          className="w-64 px-4 py-1.5 rounded-full bg-white/15 text-white placeholder-white/60 text-sm outline-none focus:bg-white/25"
        />
        <span className="text-white/80 cursor-pointer">👤</span>
      </div>
    </header>
  )
}
