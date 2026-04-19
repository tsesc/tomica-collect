import { Outlet, Link } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { TopNav } from './TopNav'

export function Layout() {
  return (
    <div className="h-dvh flex flex-col bg-surface font-body text-on-surface overflow-hidden">
      {/* Mobile header */}
      <header className="md:hidden h-12 shrink-0 bg-primary-container flex items-center justify-between px-4 z-40">
        <Link to="/" className="text-white font-display font-bold text-base tracking-tight">
          Tomica<span className="font-light opacity-85">Collect</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-white/80 text-[20px]">notifications</span>
        </div>
      </header>

      {/* Desktop header */}
      <div className="hidden md:block shrink-0 z-40">
        <TopNav />
      </div>

      <main className="flex-1 overflow-y-auto overscroll-none">
        <Outlet />
      </main>

      {/* Bottom nav — ALWAYS visible, all screen sizes */}
      <div className="shrink-0 z-50">
        <BottomNav />
      </div>
    </div>
  )
}
