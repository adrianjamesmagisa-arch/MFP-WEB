type QueryLike = {
  range: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>
}

const PAGE = 1000

/** Fetch every row — PostgREST/Supabase caps a single request around 1000. */
export async function fetchAllRows<T = any>(buildQuery: () => QueryLike): Promise<T[]> {
  const out: T[] = []
  const seenIds = new Set<unknown>()

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const chunk = (data || []) as T[]
    for (const item of chunk) {
      const id = (item as any)?.id
      if (id !== undefined && id !== null) {
        if (seenIds.has(id)) continue
        seenIds.add(id)
      }
      out.push(item)
    }
    if (chunk.length < PAGE) break
  }
  return out
}
