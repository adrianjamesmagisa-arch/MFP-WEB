import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-session'
import { createClient } from '@/lib/supabase/server'
import { loadMfpListRows, mfpListVersion } from '@/lib/mfp-list-data'
import { AnalysisRequestError, readAnalysisBody, readMfpAnalysisRequest } from '@/lib/mfp-analysis-request'
import { summarizeMfpRows } from '@/lib/mfp-analytics'
import { analyzeMfpColumns, answerMfpColumnQuestion, mfpColumnExplanationFacts } from '@/lib/mfp-column-analytics'
import { analysisColumnLabel } from '@/lib/mfp-analysis-columns'
import { GroqChatError, requestGroq } from '@/lib/groq-chat'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { user, profile } = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Please log in to analyze MFP Data.' }, { status: 401 })
    if (!profile || !['encoder', 'viewer', 'admin', 'super_admin'].includes(profile.role) ||
      (profile.role === 'encoder' && !profile.center?.trim())) {
      return NextResponse.json({ error: 'Your data access could not be determined. Ask an administrator to check your profile.' }, { status: 403 })
    }
    const input = readMfpAnalysisRequest(await readAnalysisBody(request))
    const rows = await loadMfpListRows(await createClient(), profile, input.filters)
    if (mfpListVersion(rows) !== input.version) return NextResponse.json({ error: 'MFP Data changed since this table loaded. Refresh the table before asking again.', stale: true }, { status: 409 })
    const selection = new Set(input.selectedIds)
    const scopedRows = input.scope === 'selected' ? rows.filter(row => selection.has(row.id)) : rows
    if (input.scope === 'selected' && scopedRows.length !== selection.size) {
      return NextResponse.json({ error: 'Some selected records are no longer in your authorized filtered scope. Refresh the table.', stale: true }, { status: 409 })
    }
    if (!scopedRows.length) return NextResponse.json({ content: 'No records match this analysis scope.', origin: 'computed' })
    const summary = summarizeMfpRows(scopedRows)
    const question = input.messages.at(-1)!.content
    const effectiveFilters = profile.role === 'encoder' ? { ...input.filters, center: profile.center } : input.filters
    const filterText = Object.entries(effectiveFilters).filter(([, value]) => value).map(([name, value]) => `${name.replaceAll('_', ' ')}: ${value}`).join('; ')
    const basis = `Scope: ${input.scope === 'selected' ? 'selected' : 'all filtered'} records (${scopedRows.length.toLocaleString()} rows). Columns: ${input.columns.map(analysisColumnLabel).join('; ')}. ${filterText || 'All authorized records'}. Verified against the current MFP Data source on ${new Date().toISOString()}.`
    if (input.action === 'columns') return NextResponse.json({ content: analyzeMfpColumns(scopedRows, input.columns, summary), basis, origin: 'computed' })
    const exact = answerMfpColumnQuestion(scopedRows, question, input.columns, summary)
    if (exact) return NextResponse.json({ content: exact, basis, origin: 'computed' })
    // Never let the LLM substitute a broad aggregate for a narrower, unimplemented operation.
    if (/\b(how many|count|total|sum|list|which schools?|number of|how much)\b/i.test(question)) {
      return NextResponse.json({ origin: 'computed', basis,
        content: 'I cannot calculate that specific condition from the available analysis operations. Apply the matching table filters, then ask “How many schools are participating in the filtered rows?”, “Total milk cost”, or “Break down milk packs and funds by center”. I will not substitute the full scope total for a narrower question.' })
    }
    const facts = mfpColumnExplanationFacts(scopedRows, input.columns, summary)
    const system = 'Explain the verified MFP aggregates below concisely. You cannot see individual school rows. Do not apply extra name, year, geographic or financial conditions; ask the user to filter the table when needed.\n' +
      Object.entries(facts).map(([name, value]) => `${name}: ${JSON.stringify(value)}`).join('\n')
    const reply = await requestGroq({ request, messages: input.messages, model: input.model, system })
    return NextResponse.json({ ...reply, basis, origin: 'groq' })
  } catch (error) {
    if (error instanceof AnalysisRequestError) return NextResponse.json({ error: error.message }, { status: 400 })
    if (error instanceof GroqChatError) return NextResponse.json({ error: error.message, retryAfter: error.retryAfter, requiresKey: error.requiresKey },
      { status: error.status, headers: error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : undefined })
    console.error('MFP analysis failed:', error instanceof Error ? error.name : 'Unknown error')
    return NextResponse.json({ error: 'Could not load complete analysis data. Refresh the table and try again. No estimate was generated.' }, { status: 500 })
  }
}
