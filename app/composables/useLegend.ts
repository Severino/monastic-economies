// Which highlight categories are shown in the transcript. Persisted per browser.
export const LEGEND = [
  { key: 'person', label: 'Persons' },
  { key: 'place', label: 'Places' },
  { key: 'org', label: 'Organisations' },
  { key: 'action', label: 'Actions' },
] as const
export type LegendKey = (typeof LEGEND)[number]['key']

const STORAGE_KEY = 'monastic-economies:legend'

export function useLegend() {
  const hidden = useState<LegendKey[]>('legend-hidden', () => [])
  // read after hydration, so server and client render the same markup first
  onMounted(() => {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
      if (Array.isArray(v)) hidden.value = v.filter((k) => LEGEND.some((l) => l.key === k))
    } catch {
      /* storage unavailable: keep defaults */
    }
  })
  function toggle(key: LegendKey) {
    hidden.value = hidden.value.includes(key) ? hidden.value.filter((k) => k !== key) : [...hidden.value, key]
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden.value))
    } catch {
      /* ignore */
    }
  }
  const isOn = (key: LegendKey) => !hidden.value.includes(key)
  return { hidden, toggle, isOn }
}
