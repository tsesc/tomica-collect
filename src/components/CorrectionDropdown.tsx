import type { RecognitionCandidate } from '../lib/types'

interface Props {
  candidates: RecognitionCandidate[]
  selected: string
  onSelect: (catalogId: string) => void
  onManualSearch?: () => void
}

export function CorrectionDropdown({ candidates, selected, onSelect, onManualSearch }: Props) {
  return (
    <div className="bg-surface-container-low rounded-2xl p-4">
      <label className="text-xs text-on-surface-variant block mb-2">不正確？選擇正確的車種</label>
      <select value={selected} onChange={(e) => { if (e.target.value === '__search__') { onManualSearch?.() } else { onSelect(e.target.value) } }}
        className="w-full px-3 py-2.5 rounded-xl bg-white text-on-surface text-sm outline-none appearance-none">
        {candidates.map((c) => (
          <option key={c.catalog_item.id} value={c.catalog_item.id}>
            {c.catalog_item.model_number} {c.catalog_item.car_name}（{Math.round(c.score * 100)}%）
          </option>
        ))}
        <option value="__search__">── 手動搜尋其他車種 ──</option>
      </select>
    </div>
  )
}
