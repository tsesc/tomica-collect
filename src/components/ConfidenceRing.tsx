interface Props {
  value: number
  size?: number
}

export function ConfidenceRing({ value, size = 64 }: Props) {
  const pct = Math.round(value * 100)
  const level = value > 0.9 ? 'high' : value > 0.7 ? 'medium' : 'low'
  const colors = { high: 'text-success border-success', medium: 'text-yellow-600 border-yellow-500', low: 'text-error border-error' }

  return (
    <div className="flex flex-col items-center gap-1" data-confidence={level}>
      <div className={`rounded-full border-4 flex items-center justify-center font-display font-bold ${colors[level]}`} style={{ width: size, height: size }}>
        {pct}%
      </div>
      <span className={`text-xs font-medium ${colors[level].split(' ')[0]}`}>
        {level === 'high' ? '高信心匹配' : level === 'medium' ? '中等信心' : '低信心'}
      </span>
    </div>
  )
}
