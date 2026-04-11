interface FilterOption { value: string; label: string }
interface FilterGroup { label: string; options: FilterOption[]; selected: string | null; onSelect: (value: string | null) => void }
interface Props { groups: FilterGroup[] }

export function FilterSidebar({ groups }: Props) {
  return (
    <aside className="w-60 flex-shrink-0 space-y-5 pr-4">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">{group.label}</div>
          <div className="flex flex-wrap gap-1.5">
            {group.options.map((opt) => (
              <button key={opt.value} onClick={() => group.onSelect(group.selected === opt.value ? null : opt.value)}
                className={`px-3 py-1 rounded-full text-xs transition-all ${group.selected === opt.value ? 'bg-primary text-white scale-105' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </aside>
  )
}
