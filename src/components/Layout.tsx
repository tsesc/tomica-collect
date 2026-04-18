import { Outlet, Link } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { TopNav } from './TopNav'

export function Layout() {
  return (
    <div className="min-h-screen bg-surface font-body text-on-surface">
      {/* Mobile header */}
      <header className="md:hidden h-12 bg-primary-container flex items-center justify-between px-4 sticky top-0 z-40">
        <Link to="/" className="text-white font-display font-bold text-base tracking-tight">
          Tomica<span className="font-light opacity-85">Collect</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-white/80 text-[20px]">notifications</span>
        </div>
      </header>

      {/* Desktop header */}
      <div className="hidden md:block sticky top-0 z-40">
        <TopNav />
      </div>

      <main className="pb-20 md:pb-16">
        <Outlet />
      </main>

      {/* Bottom nav — ALWAYS visible, all screen sizes */}
      <div className="fixed bottom-0 inset-x-0 z-50">
        <BottomNav />
      </div>
    </div>
  )
}
