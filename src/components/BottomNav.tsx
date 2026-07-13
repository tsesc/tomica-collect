import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: '掃描', icon: 'photo_camera' },
  { to: '/catalog', label: '圖鑑', icon: 'auto_stories' },
  { to: '/collection', label: '收藏', icon: 'shelves' },
  { to: '/settings', label: '設定', icon: 'settings' },
]

export function BottomNav() {
  return (
    <nav className="flex items-center justify-around h-16 bg-white/90 backdrop-blur-lg border-t border-outline-variant/30">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-[11px] font-medium transition-colors ${isActive ? 'text-primary' : 'text-on-surface-variant'}`
          }
        >
          <span className="material-symbols-outlined text-[22px]">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
