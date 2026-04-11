interface Props {
  collected: number
  missing: number
  total: number
}

export function StatsRow({ collected, missing, total }: Props) {
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0
  return (
    <div className="grid grid-cols-3 gap-3">
      {[{ number: collected, label: '已收藏' }, { number: missing, label: '未收藏' }, { number: `${pct}%`, label: '完成率' }].map((stat) => (
        <div key={stat.label} className="bg-white rounded-xl p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-primary font-display">{stat.number}</div>
          <div className="text-xs text-on-surface-variant">{stat.label}</div>
        </div>
      ))}
    </div>
  )
}
