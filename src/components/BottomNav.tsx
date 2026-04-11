import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: '掃描', icon: '📷' },
  { to: '/catalog', label: '圖鑑', icon: '📚' },
  { to: '/collection', label: '收藏', icon: '🏆' },
  { to: '/settings', label: '設定', icon: '⚙️' },
]

export function BottomNav() {
  return (
    <nav className="flex items-center justify-around h-16 bg-white border-t border-outline-variant">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 text-xs ${isActive ? 'text-primary' : 'text-on-surface-variant'}`
          }
        >
          <span className="text-lg">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
