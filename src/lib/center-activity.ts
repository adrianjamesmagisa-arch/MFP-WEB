/**
 * Center activity: explicit log rows + derived create/update timestamps.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { mfpCenterAliases, sbfpCenterAliases } from '@/lib/center-aliases'

export type CenterActivityAction = 'created' | 'updated' | 'deleted'

export type CenterActivityEvent = {
  id: string
  center: string
  action: CenterActivityAction
  source: string
  sourceId?: string | null
  summary: string
  detail?: string | null
  at: string
  actorId?: string | null
  actorName?: string | null
  fromLog?: boolean
}

type SupabaseLike = Pick<SupabaseClient, 'from'> & { auth?: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } }

function isMissingRelation(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? error.code : null
  if (code === '42P01' || code === 'PGRST205') return true
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return /mfp_center_activity/i.test(message) && /does not exist|could not find.*table/i.test(message)
}

export async function logCenterActivity(
  supabase: SupabaseLike,
  input: {
    center: string
    action: CenterActivityAction
    source: string
    sourceId?: string | null
    summary: string
    detail?: string | null
    actorId?: string | null
  },
): Promise<void> {
  const center = String(input.center || '').trim()
  if (!center || !input.summary) return

  let actorId = input.actorId ?? null
  if (!actorId && supabase.auth?.getUser) {
    try {
      const { data } = await supabase.auth.getUser()
      actorId = data.user?.id ?? null
    } catch {
      // ignore
    }
  }

  try {
    const { error } = await supabase.from('mfp_center_activity').insert({
      center,
      actor_id: actorId,
      action: input.action,
      source: input.source,
      source_id: input.sourceId || null,
      summary: input.summary,
      detail: input.detail || null,
    })
    if (error && !isMissingRelation(error)) {
      console.warn('center activity log failed:', error.message)
    }
  } catch (e) {
    console.warn('center activity log failed:', e instanceof Error ? e.message : e)
  }
}

function dayKey(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return d.toISOString().slice(0, 10)
}

/** Human day label for list grouping (Today / Yesterday / Last week / date). */
export function activityDayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unknown date'

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startEvent = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startToday.getTime() - startEvent.getTime()) / 86_400_000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays > 1 && diffDays < 7) return 'Earlier this week'
  if (diffDays >= 7 && diffDays < 14) return 'Last week'
  if (diffDays >= 14 && diffDays < 30) return 'Earlier this month'

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function groupActivityByDay(events: CenterActivityEvent[], now = new Date()) {
  const groups: { key: string; label: string; events: CenterActivityEvent[] }[] = []
  const index = new Map<string, number>()

  for (const event of events) {
    const key = dayKey(event.at)
    const existing = index.get(key)
    if (existing == null) {
      index.set(key, groups.length)
      groups.push({ key, label: activityDayLabel(event.at, now), events: [event] })
    } else {
      groups[existing].events.push(event)
    }
  }
  return groups
}

async function loadActorNames(
  supabase: SupabaseLike,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200)
    const { data, error } = await supabase.from('profiles').select('id,full_name,email').in('id', chunk)
    if (error) throw new Error(error.message)
    for (const row of data || []) {
      const name = String(row.full_name || row.email || '').trim()
      if (name) map.set(row.id, name)
    }
  }
  return map
}

function pushEvent(
  list: CenterActivityEvent[],
  event: Omit<CenterActivityEvent, 'id'> & { id?: string },
) {
  list.push({
    id: event.id || `${event.source}:${event.sourceId || 'x'}:${event.action}:${event.at}`,
    ...event,
  })
}

const activitySources = [
  { table: 'mfp_data', label: 'MFP record' },
  { table: 'sbfp_data', label: 'SBFP procurement' },
  { table: 'sbfp_dropoff_points', label: 'drop-off' },
] as const

type ActivityRecord = {
  id: string
  created_at: string | null
  updated_at: string | null
  created_by?: string | null
  funded_by?: string | null
  elementary_school?: string | null
  municipality?: string | null
  sdo?: string | null
  dropoff_name?: string | null
}

function selectActivityRecords(supabase: SupabaseLike, source: typeof activitySources[number]) {
  const query = supabase.from(source.table)
  if (source.table === 'mfp_data') return query.select('id,center,funded_by,elementary_school,municipality,created_at,updated_at,created_by')
  if (source.table === 'sbfp_data') return query.select('id,center,sdo,created_at,updated_at')
  return query.select('id,center,dropoff_name,sdo,created_at,updated_at')
}

function recordEvent(row: ActivityRecord, center: string, source: typeof activitySources[number], action: 'created' | 'updated', at: string): CenterActivityEvent {
  const label = source.table === 'mfp_data' ? row.elementary_school || row.municipality || 'record'
    : source.table === 'sbfp_data' ? row.sdo || 'SDO' : row.dropoff_name || 'school'
  return {
    id: `${source.table}:${row.id}:${action}`,
    center, source: source.table, sourceId: row.id, action,
    summary: `${action === 'created' ? 'Created' : 'Updated'} ${source.label} · ${label.trim()}`,
    detail: source.table === 'mfp_data' ? row.funded_by : source.table === 'sbfp_dropoff_points' ? row.sdo : null,
    at,
    actorId: action === 'created' && source.table === 'mfp_data' ? row.created_by : null,
  }
}

/** Read only candidates that can enter the newest `limit` events for this source. */
async function loadRecordActivity(supabase: SupabaseLike, center: string, aliases: string[], source: typeof activitySources[number], limit: number) {
  const events: CenterActivityEvent[] = []
  let hasReadErrors = false
  const { data, error } = await selectActivityRecords(supabase, source)
    .in('center', aliases).order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: true }).limit(limit)
  if (error) {
    hasReadErrors = true
    console.warn('load activity creations:', error.message)
  }
  for (const row of data || []) {
    if (row.created_at && Number.isFinite(Date.parse(row.created_at))) events.push(recordEvent(row, center, source, 'created', row.created_at))
  }
  // Older updates cannot enter the result once `limit` newer creations exist.
  const cutoff = events.length >= limit ? events[events.length - 1].at : null
  const pageSize = Math.min(1000, Math.max(limit, 50))
  let updates = 0
  for (let from = 0; updates < limit; from += pageSize) {
    let query = selectActivityRecords(supabase, source).in('center', aliases)
      .not('updated_at', 'is', null)
    if (cutoff) query = query.gt('updated_at', cutoff)
    const { data: edited, error: editError } = await query
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true }).range(from, from + pageSize - 1)
    if (editError) {
      hasReadErrors = true
      console.warn('load activity edits:', editError.message)
      break
    }
    for (const row of edited || []) {
      if (row.updated_at && row.created_at && Date.parse(row.updated_at) - Date.parse(row.created_at) > 2000) {
        events.push(recordEvent(row, center, source, 'updated', row.updated_at))
        if (++updates >= limit) break
      }
    }
    if (!edited || edited.length < pageSize) break
  }
  return { events, hasReadErrors }
}

/** The overview uses exactly the timeline's newest event, with three centers in flight. */
export async function loadCenterActivitySummaries(supabase: SupabaseLike, centers: readonly string[]) {
  const summaries: Record<string, { at: string | null; hasReadErrors: boolean }> = {}
  for (let from = 0; from < centers.length; from += 3) {
    await Promise.all(centers.slice(from, from + 3).map(async center => {
      const result = await loadCenterActivityLog(supabase, center, { limit: 1, includeActors: false })
      summaries[center] = { at: result.events[0]?.at ?? null, hasReadErrors: result.hasReadErrors }
    }))
  }
  return summaries
}

/**
 * Load explicit activity log (if migrated) plus derived create/update events
 * from operational tables so admins can track encoder work times.
 */
export async function loadCenterActivityLog(
  supabase: SupabaseLike,
  center: string,
  options?: { limit?: number; includeActors?: boolean },
): Promise<{ events: CenterActivityEvent[]; logReady: boolean; hasReadErrors: boolean }> {
  const limit = options?.limit ?? 400
  const events: CenterActivityEvent[] = []
  let logReady = true
  let hasReadErrors = false
  const mfpAliases = mfpCenterAliases(center)
  const sbfpAliases = sbfpCenterAliases(center)

  try {
    const { data, error } = await supabase
      .from('mfp_center_activity')
      .select('id,center,actor_id,action,source,source_id,summary,detail,created_at')
      .in('center', mfpAliases)
      .order('created_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .limit(limit)
    if (error) {
      if (isMissingRelation(error)) logReady = false
      else throw new Error(error.message)
    } else {
      for (const row of data || []) {
        pushEvent(events, {
          id: row.id,
          center: row.center,
          action: row.action,
          source: row.source,
          sourceId: row.source_id,
          summary: row.summary,
          detail: row.detail,
          at: row.created_at,
          actorId: row.actor_id,
          fromLog: true,
        })
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (isMissingRelation(e)) logReady = false
    else {
      hasReadErrors = true
      console.warn('load activity log:', msg)
    }
  }

  // Each center reads its newest creations and edits separately. Creation order
  // alone misses a recently edited older record after the API row limit.
  for (const source of activitySources) {
    const aliases = source.table === 'mfp_data' ? mfpAliases : sbfpAliases
    try {
      const { events: sourceEvents, hasReadErrors: sourceFailed } = await loadRecordActivity(
        supabase, center, aliases, source, limit,
      )
      events.push(...sourceEvents)
      hasReadErrors ||= sourceFailed
    } catch (e) {
      hasReadErrors = true
      console.warn('load record activity:', e instanceof Error ? e.message : e)
    }
  }

  // Merge explicit log + derived stamps; dedupe near-identical events.
  const preferred = events

  // Deduplicate identical source/action/time (±1s)
  const seen = new Set<string>()
  const deduped: CenterActivityEvent[] = []
  for (const event of preferred.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )) {
    const bucket = Math.floor(new Date(event.at).getTime() / 1000)
    const key = `${event.source}|${event.sourceId || ''}|${event.action}|${bucket}|${event.summary}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(event)
    if (deduped.length >= limit) break
  }

  if (options?.includeActors !== false) {
    try {
      const actorNames = await loadActorNames(
        supabase, deduped.map(event => event.actorId || '').filter(Boolean),
      )
      for (const event of deduped) {
        if (event.actorId) event.actorName = actorNames.get(event.actorId) || null
      }
    } catch (e) {
      hasReadErrors = true
      console.warn('load activity actors:', e instanceof Error ? e.message : e)
    }
  }

  return { events: deduped, logReady, hasReadErrors }
}
