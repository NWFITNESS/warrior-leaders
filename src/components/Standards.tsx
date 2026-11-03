// Movement standards as bullet points: one line in the builder = one bullet ("- ", "•", "*" are stripped).
// `collapsible` (judge app) tucks them into a tap-to-open dropdown so the scoring screen stays compact.

export function standardsLines(text: string | null | undefined) {
  return (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*–]\s*/, '').trim())
    .filter(Boolean)
}

export function Standards({ text, collapsible = false, label = 'Standards', className }: {
  text: string | null | undefined; collapsible?: boolean; label?: string; className?: string
}) {
  const lines = standardsLines(text)
  if (!lines.length) return null
  const list = <ul className="std-list">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
  if (!collapsible) return <div className={className}>{list}</div>
  return (
    <details className={`std-drop${className ? ` ${className}` : ''}`}>
      <summary>{label} <span className="subtle">({lines.length})</span></summary>
      {list}
    </details>
  )
}
