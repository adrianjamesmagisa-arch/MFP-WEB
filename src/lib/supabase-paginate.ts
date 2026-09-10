type QueryLike = {
  range: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>
}

const PAGE = 1000

/** Fetch every row — PostgREST/Supabase caps a single request around 1000. */
export async function fetchAllRows<T = any>(buildQuery: () => QueryLike): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const chunk = (data || []) as T[]
    out.push(...chunk)
    if (chunk.length < PAGE) break
  }
  return out
}
