import type { MfpListFilters } from '@/lib/mfp-list-filters'
import { ALL_MFP_ANALYSIS_COLUMNS, isMfpAnalysisColumnId } from '@/lib/mfp-analysis-columns'

export const AI_MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'] as const
export type AiModel = typeof AI_MODELS[number]
export interface AiMessage { role: 'user' | 'assistant'; content: string }
export class AnalysisRequestError extends Error {}
export const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export async function readAnalysisBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new AnalysisRequestError('A JSON request is required.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > 256000) { await reader.cancel(); throw new AnalysisRequestError('Request too large. Reduce the selection or start a new conversation.') }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  catch { throw new AnalysisRequestError('Send a valid JSON request.') }
}

export function readMessages(value: unknown): AiMessage[] {
  if (!Array.isArray(value) || !value.length || value.length > 20) throw new AnalysisRequestError('Send between 1 and 20 conversation messages.')
  const messages = value.map((item): AiMessage => {
    if (!isObject(item) || (item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string' || !item.content.trim()) {
      throw new AnalysisRequestError('Messages must contain user or assistant text.')
    }
    // Old answers can be large; they are trimmed by the provider's conversation budget.
    if (item.content.length > 20000) throw new AnalysisRequestError('Conversation message is too long. Start a new conversation.')
    return { role: item.role, content: item.content.trim() }
  })
  const latest = messages.at(-1)
  if (latest?.role !== 'user' || Buffer.byteLength(latest.content, 'utf8') > 2000) {
    throw new AnalysisRequestError('Keep your latest question under 2,000 UTF-8 bytes and end with a user message.')
  }
  return messages
}

export function readModel(value: unknown): AiModel {
  if (value === undefined) return AI_MODELS[0]
  if (!AI_MODELS.some(model => model === value)) throw new AnalysisRequestError('Choose a supported AI model from settings.')
  return value as AiModel
}

const filterKeys = ['year', 'funded_by', 'region', 'center', 'search', 'province', 'division', 'municipality',
  'milk_type', 'supplier', 'date_started_year', 'date_started_month', 'date_completed_year', 'date_completed_month', 'input_month', 'input_year'] as const

export function readMfpAnalysisRequest(body: unknown) {
  if (!isObject(body) || !isObject(body.filters)) throw new AnalysisRequestError('The current table filters are required. Refresh MFP Data.')
  const filters: MfpListFilters = {}
  for (const [key, value] of Object.entries(body.filters)) {
    if (!filterKeys.some(field => field === key) || typeof value !== 'string' || value.length > 500 || /[\r\n\x00]/.test(value)) {
      throw new AnalysisRequestError('Invalid table filters. Refresh MFP Data.')
    }
    if (value) filters[key as keyof MfpListFilters] = value
  }
  for (const key of ['year', 'date_started_year', 'date_completed_year', 'input_year'] as const) {
    if (filters[key] && filters[key] !== '__ALL_YEARS__' && !/^\d{4}(,\s*\d{4}){0,19}$/.test(filters[key])) {
      throw new AnalysisRequestError('Invalid year filter.')
    }
  }
  if (filters.input_month && (!/^\d{1,2}$/.test(filters.input_month) || Number(filters.input_month) < 1 || Number(filters.input_month) > 12)) {
    throw new AnalysisRequestError('Invalid input month.')
  }
  if (typeof body.version !== 'string' || !/^[a-f0-9]{64}$/.test(body.version)) throw new AnalysisRequestError('Refresh the table before asking a question.')
  if (body.scope !== 'filtered' && body.scope !== 'selected') throw new AnalysisRequestError('Choose filtered or selected records.')
  if (!Array.isArray(body.selectedIds) || body.selectedIds.length > 10000 || !body.selectedIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 10000)) {
    throw new AnalysisRequestError('Invalid analysis selection.')
  }
  const selectedIds = [...new Set(body.selectedIds as string[])]
  if (body.scope === 'selected' && !selectedIds.length) throw new AnalysisRequestError('Select records using the Analyze checkboxes first.')
  const requestedColumns = body.columns === undefined ? ALL_MFP_ANALYSIS_COLUMNS : body.columns
  if (!Array.isArray(requestedColumns) || !requestedColumns.length || requestedColumns.length > ALL_MFP_ANALYSIS_COLUMNS.length || !requestedColumns.every(isMfpAnalysisColumnId)) {
    throw new AnalysisRequestError('Choose supported analysis columns or use All supported columns.')
  }
  if (body.action !== undefined && body.action !== 'question' && body.action !== 'columns') throw new AnalysisRequestError('Invalid analysis action.')
  const columns = [...new Set(requestedColumns)]
  return { filters, version: body.version, scope: body.scope, selectedIds, columns, action: body.action || 'question',
    messages: readMessages(body.messages), model: readModel(body.model) }
}
