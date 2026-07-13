import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: '掃描', icon: 'photo_camera' },
  { to: '/catalog', label: '圖鑑', icon: 'auto_stories' },
  { to: '/collection', label: '收藏', icon: 'shelves' },
  { to: '/settings', label: '設定', icon: 'settings' },
]

export function TopNav() {
  return (
    <header className="h-14 bg-primary-container flex items-center justify-between px-6">
      <NavLink to="/" className="text-white font-display font-bold text-lg tracking-tight">
        Tomica<span className="font-light opacity-85">Collect</span>
      </NavLink>
      <nav className="flex items-center gap-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                isActive
                  ? 'bg-white/20 text-white font-semibold'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`
            }
          >
            <span className="material-symbols-outlined text-[18px]">{link.icon}</span>
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-white/80 cursor-pointer text-[22px]">person</span>
      </div>
    </header>
  )
}
