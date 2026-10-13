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
      provinces?: string[]
      fundedBy: string[]
      milkTypes: string[]
      cooperatives?: string[]
    }
    compactTable?: string
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
    const { messages, context, model = 'openai/gpt-oss-120b' } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required.' }, { status: 400 })
    }

    // 4. Construct grounded system prompt with filtered table context (token-optimized)
    const summary = context?.summaryMetrics || {
      totalPacks: 0,
      totalDelivered: 0,
      totalVolume: 0,
      totalBeneficiaries: 0,
      totalFunds: 0,
      centers: [],
      regions: [],
      provinces: [],
      fundedBy: [],
      milkTypes: [],
      cooperatives: [],
    }

    const totalRecords = context?.totalRecords ?? 0
    const activeFilters = context?.activeFilters ?? {}
    const compactTable = context?.compactTable ?? ''

    const filterEntries = Object.entries(activeFilters)
      .filter(([_, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')

    const coopsText = summary.cooperatives && summary.cooperatives.length > 0
      ? summary.cooperatives.map(c => `- ${c}`).join('\n')
      : 'None'

    const centersText = summary.centers && summary.centers.length > 0
      ? summary.centers.map(c => `- ${c}`).join('\n')
      : 'All'

    const systemPrompt = `You are the DA-PCC MFP AI Analyst, an intelligent copilot for the Department of Agriculture - Philippine Carabao Center (DA-PCC) Milk Feeding Program (MFP) Monitoring System.

You have access to the exact filtered dataset currently displayed on the user's screen.

### SCOPE & PRE-CALCULATED TOTALS:
- Total records in scope: ${totalRecords}
- Active filters applied: ${filterEntries || 'None (All records in scope)'}
- Key Aggregates:
  * Total Milk Packs Target: ${summary.totalPacks.toLocaleString('en-US')}
  * Total Milk Packs Delivered: ${summary.totalDelivered.toLocaleString('en-US')}
  * Delivery Completion Rate: ${summary.totalPacks > 0 ? ((summary.totalDelivered / summary.totalPacks) * 100).toFixed(1) + '%' : 'N/A'}
  * Total Volume (Liters): ${summary.totalVolume.toLocaleString('en-US')} L
  * Total Beneficiaries: ${summary.totalBeneficiaries.toLocaleString('en-US')}
  * Total Funds Transferred: ₱${summary.totalFunds.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  * Funding Sources: ${summary.fundedBy.join(', ') || 'All'}
  * Regions: ${summary.regions.join(', ') || 'All'}
  * Milk Types: ${summary.milkTypes.join(', ') || 'All'}

### PARTICIPATING COOPERATIVES / SUPPLIERS (${summary.cooperatives?.length || 0}):
${coopsText}

### CENTERS BREAKDOWN:
${centersText}

### SAMPLE ROWS (Pipe-separated table):
${compactTable}

### INSTRUCTIONS:
1. Base your answers strictly on the dataset and pre-calculated aggregates provided above.
2. If asked about cooperatives, reference the participating cooperatives list or row data.
3. If asked for totals, comparisons, or rankings, compute or reference them accurately.
4. Currency format: "₱" with commas (e.g. ₱1,250,000.00). Quantities format: with commas (e.g. 88,240 packs).
5. Format cleanly using GitHub-flavored Markdown (bullet lists, bold text, or markdown tables).
6. Be concise, direct, professional, and helpful.`

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
