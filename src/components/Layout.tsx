import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { TopNav } from './TopNav'

export function Layout() {
  return (
    <div className="min-h-screen bg-surface font-body text-on-surface">
      <div className="hidden md:block">
        <TopNav />
      </div>
      <main className="pb-16 md:pb-0">
        <Outlet />
      </main>
      <div className="md:hidden fixed bottom-0 inset-x-0">
        <BottomNav />
      </div>
    </div>
  )
}
