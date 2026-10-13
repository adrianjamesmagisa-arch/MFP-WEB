import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-session'

export const dynamic = 'force-dynamic'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface RequestBody {
  messages: ChatMessage[]
  context?: {
    totalRecords: number
    activeFilters?: Record<string, string | number | undefined>
    summaryMetrics?: {
      totalPacks: number
      totalDelivered: number
      totalVolume: number
      totalBeneficiaries: number
      totalFunds: number
      centers: string[]
      regions: string[]
      fundedBy: string[]
      milkTypes: string[]
    }
    sampleRows?: Array<Record<string, unknown>>
  }
  model?: string
}

export async function POST(req: Request) {
  try {
    // 1. Verify user session
    const { user } = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 })
    }

    // 2. Resolve Groq API Key
    const customKey = req.headers.get('x-groq-api-key')?.trim()
    const envKey = process.env.GROQ_API_KEY?.trim() || process.env.NEXT_PUBLIC_GROQ_API_KEY?.trim()
    const apiKey = customKey || envKey

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Groq API key not configured. Please add GROQ_API_KEY to your .env.local file or enter it in the AI Agent settings.',
          requiresKey: true,
        },
        { status: 400 },
      )
    }

    // 3. Parse request body
    const body: RequestBody = await req.json()
    const { messages, context, model = 'llama-3.3-70b-versatile' } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required.' }, { status: 400 })
    }

    // 4. Construct grounded system prompt with filtered table context
    const summary = context?.summaryMetrics || {
      totalPacks: 0,
      totalDelivered: 0,
      totalVolume: 0,
      totalBeneficiaries: 0,
      totalFunds: 0,
      centers: [],
      regions: [],
      fundedBy: [],
      milkTypes: [],
    }

    const totalRecords = context?.totalRecords ?? 0
    const activeFilters = context?.activeFilters ?? {}
    const sampleRows = context?.sampleRows ?? []

    const filterEntries = Object.entries(activeFilters)
      .filter(([_, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')

    const systemPrompt = `You are the DA-PCC MFP AI Analyst, an intelligent copilot embedded directly in the Department of Agriculture - Philippine Carabao Center (DA-PCC) Milk Feeding Program (MFP) Monitoring System.

You have access to the exact dataset currently filtered and displayed on the user's screen (like Gemini in Google Sheets).

### SCOPE & SUMMARY OF CURRENTLY FILTERED DATA:
- Total matching records: ${totalRecords}
- Active filters applied by user: ${filterEntries || 'None (All records in scope)'}
- Key Aggregates:
  * Total Milk Packs Target: ${summary.totalPacks.toLocaleString('en-US')}
  * Total Milk Packs Delivered: ${summary.totalDelivered.toLocaleString('en-US')}
  * Delivery Completion Rate: ${summary.totalPacks > 0 ? ((summary.totalDelivered / summary.totalPacks) * 100).toFixed(1) + '%' : 'N/A'}
  * Total Volume (Liters): ${summary.totalVolume.toLocaleString('en-US')} L
  * Total Beneficiaries: ${summary.totalBeneficiaries.toLocaleString('en-US')}
  * Total Funds Transferred: ₱${summary.totalFunds.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  * Centers involved: ${summary.centers.length > 0 ? summary.centers.join(', ') : 'All'}
  * Regions: ${summary.regions.length > 0 ? summary.regions.join(', ') : 'All'}
  * Funding Sources: ${summary.fundedBy.length > 0 ? summary.fundedBy.join(', ') : 'All'}
  * Milk Types: ${summary.milkTypes.length > 0 ? summary.milkTypes.join(', ') : 'All'}

### ROW-LEVEL DATA (${sampleRows.length} rows):
\`\`\`json
${JSON.stringify(sampleRows, null, 2)}
\`\`\`

### INSTRUCTIONS:
1. Ground your answers strictly on the dataset provided above. Do NOT make up numbers or invent fictitious centers, schools, or cooperatives.
2. If asked for totals, comparisons, or rankings, compute or reference them accurately based on the row data or pre-calculated aggregates.
3. Currency should always use Philippine Peso ("₱") formatted with commas (e.g. ₱1,250,000.00). Quantities and counts should use comma separators (e.g. 88,240 packs).
4. Use clear GitHub-flavored Markdown:
   - Use bold for key numbers and entities.
   - Use Markdown tables when comparing centers, regions, cooperatives, or programs.
   - Use concise bulleted lists for takeaways or summaries.
5. If the user asks about records outside the current filter scope, politely note what is visible in the current view and suggest modifying their sidebar filters.
6. Provide helpful, professional, and directly actionable insights for DA-PCC administrators and encoders.`

    // 5. Call Groq API (OpenAI-compatible endpoint)
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        ],
        temperature: 0.2,
        max_tokens: 2500,
      }),
    })

    if (!groqResponse.ok) {
      const errText = await groqResponse.text()
      let parsedMsg = errText
      try {
        const errJson = JSON.parse(errText)
        parsedMsg = errJson.error?.message || errText
      } catch {
        // use raw text
      }

      console.error('Groq API error:', groqResponse.status, parsedMsg)
      return NextResponse.json(
        {
          error: `Groq AI Error (${groqResponse.status}): ${parsedMsg}`,
        },
        { status: groqResponse.status },
      )
    }

    const data = await groqResponse.json()
    const reply = data.choices?.[0]?.message?.content || 'No response generated.'

    return NextResponse.json({
      content: reply,
      model: data.model || model,
      usage: data.usage,
    })
  } catch (err) {
    console.error('AI chat endpoint error:', err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Internal server error while processing AI request.',
      },
      { status: 500 },
    )
  }
}
