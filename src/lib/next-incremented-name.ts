/** Next unused default label: "New Province", then "New Province 2", "New Province 3", … */
export function nextIncrementedName(
  base: string,
  existing: Iterable<string | null | undefined>,
): string {
  const taken = new Set(
    [...existing]
      .map(v => String(v || '').trim().toLowerCase())
      .filter(Boolean),
  )
  const baseTrim = base.trim()
  if (!taken.has(baseTrim.toLowerCase())) return baseTrim
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${baseTrim} ${n}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  return `${baseTrim} ${Date.now()}`
}
