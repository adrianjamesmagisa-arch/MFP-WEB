/**
 * Center activity: explicit log rows + derived create/update timestamps.
 */

import { fetchAllRows } from '@/lib/supabase-paginate'

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

type SupabaseLike = { from: (table: string) => any; auth?: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } }

function isMissingRelation(message: string | undefined) {
  return /mfp_center_activity/i.test(message || '') || /schema cache/i.test(message || '') || /does not exist/i.test(message || '')
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
    if (error && !isMissingRelation(error.message)) {
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
    const { data } = await supabase.from('profiles').select('id,full_name,email').in('id', chunk)
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

/**
 * Load explicit activity log (if migrated) plus derived create/update events
 * from operational tables so admins can track encoder work times.
 */
export async function loadCenterActivityLog(
  supabase: SupabaseLike,
  center: string,
  options?: { limit?: number },
): Promise<{ events: CenterActivityEvent[]; logReady: boolean }> {
  const limit = options?.limit ?? 400
  const events: CenterActivityEvent[] = []
  let logReady = true

  try {
    const { data, error } = await supabase
      .from('mfp_center_activity')
      .select('id,center,actor_id,action,source,source_id,summary,detail,created_at')
      .eq('center', center)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      if (isMissingRelation(error.message)) logReady = false
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
    if (isMissingRelation(msg)) logReady = false
    else console.warn('load activity log:', msg)
  }

  // Derived timeline from record stamps (works even before migration).
  try {
    const mfpRows = await fetchAllRows(() =>
      supabase
        .from('mfp_data')
        .select(
          'id,center,funded_by,elementary_school,municipality,created_at,updated_at,created_by',
        )
        .eq('center', center)
        .order('created_at', { ascending: false }),
    )
    for (const row of mfpRows) {
      const label =
        String(row.elementary_school || row.municipality || 'record').trim() || 'record'
      const funded = String(row.funded_by || '').trim()
      if (row.created_at) {
        pushEvent(events, {
          center,
          action: 'created',
          source: 'mfp_data',
          sourceId: row.id,
          summary: `Created MFP record · ${label}`,
          detail: funded || null,
          at: row.created_at,
          actorId: row.created_by || null,
        })
      }
      if (
        row.updated_at &&
        row.created_at &&
        new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() > 2000
      ) {
        pushEvent(events, {
          center,
          action: 'updated',
          source: 'mfp_data',
          sourceId: row.id,
          summary: `Updated MFP record · ${label}`,
          detail: funded || null,
          at: row.updated_at,
          actorId: null,
        })
      }
    }
  } catch (e) {
    console.warn('derive mfp activity:', e instanceof Error ? e.message : e)
  }

  try {
    const sbfpRows = await fetchAllRows(() =>
      supabase
        .from('sbfp_data')
        .select('id,center,sdo,created_at,updated_at')
        .eq('center', center)
        .order('created_at', { ascending: false }),
    )
    for (const row of sbfpRows) {
      const label = String(row.sdo || 'SDO').trim() || 'SDO'
      if (row.created_at) {
        pushEvent(events, {
          center,
          action: 'created',
          source: 'sbfp_data',
          sourceId: row.id,
          summary: `Created SBFP procurement · ${label}`,
          at: row.created_at,
        })
      }
      if (
        row.updated_at &&
        row.created_at &&
        new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() > 2000
      ) {
        pushEvent(events, {
          center,
          action: 'updated',
          source: 'sbfp_data',
          sourceId: row.id,
          summary: `Updated SBFP procurement · ${label}`,
          at: row.updated_at,
        })
      }
    }
  } catch (e) {
    console.warn('derive sbfp activity:', e instanceof Error ? e.message : e)
  }

  try {
    const dropRows = await fetchAllRows(() =>
      supabase
        .from('sbfp_dropoff_points')
        .select('id,center,dropoff_name,sdo,created_at,updated_at')
        .eq('center', center)
        .order('created_at', { ascending: false }),
    )
    for (const row of dropRows) {
      const label = String(row.dropoff_name || 'school').trim() || 'school'
      if (row.created_at) {
        pushEvent(events, {
          center,
          action: 'created',
          source: 'sbfp_dropoff_points',
          sourceId: row.id,
          summary: `Created drop-off · ${label}`,
          detail: row.sdo ? String(row.sdo) : null,
          at: row.created_at,
        })
      }
      if (
        row.updated_at &&
        row.created_at &&
        new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() > 2000
      ) {
        pushEvent(events, {
          center,
          action: 'updated',
          source: 'sbfp_dropoff_points',
          sourceId: row.id,
          summary: `Updated drop-off · ${label}`,
          detail: row.sdo ? String(row.sdo) : null,
          at: row.updated_at,
        })
      }
    }
  } catch (e) {
    console.warn('derive dropoff activity:', e instanceof Error ? e.message : e)
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

  const actorNames = await loadActorNames(
    supabase,
    deduped.map(e => e.actorId || '').filter(Boolean),
  )
  for (const event of deduped) {
    if (event.actorId && actorNames.has(event.actorId)) {
      event.actorName = actorNames.get(event.actorId) || null
    }
  }

  return { events: deduped, logReady }
}
