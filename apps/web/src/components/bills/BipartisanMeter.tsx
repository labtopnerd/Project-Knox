interface Cosponsor {
  representative: {
    party: string | null
  }
}

interface Props {
  cosponsors: Cosponsor[]
}

export function BipartisanMeter({ cosponsors }: Props) {
  if (!cosponsors.length) return null

  let dem = 0
  let rep = 0
  let ind = 0

  for (const cs of cosponsors) {
    const party = (cs.representative.party ?? '').toLowerCase()
    if (party.includes('democrat')) dem++
    else if (party.includes('republican')) rep++
    else ind++
  }

  const total = dem + rep + ind
  if (total === 0) return null

  const demPct = Math.round((dem / total) * 100)
  const repPct = Math.round((rep / total) * 100)
  const indPct = 100 - demPct - repPct

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cosponsor party breakdown</p>
      {/* Bar */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {demPct > 0 && (
          <div className="bg-blue-500" style={{ width: `${demPct}%` }} title={`Democrat ${demPct}%`} />
        )}
        {repPct > 0 && (
          <div className="bg-red-500" style={{ width: `${repPct}%` }} title={`Republican ${repPct}%`} />
        )}
        {indPct > 0 && (
          <div className="bg-gray-400" style={{ width: `${indPct}%` }} title={`Other ${indPct}%`} />
        )}
      </div>
      {/* Label */}
      <p className="mt-1 text-xs text-muted-foreground">
        {demPct > 0 && <span className="text-blue-600 dark:text-blue-400">{demPct}% Democrat</span>}
        {demPct > 0 && repPct > 0 && ' · '}
        {repPct > 0 && <span className="text-red-600 dark:text-red-400">{repPct}% Republican</span>}
        {(demPct > 0 || repPct > 0) && indPct > 0 && ' · '}
        {indPct > 0 && <span>{indPct}% Other</span>}
      </p>
    </div>
  )
}
