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
    module?: 'mfp' | 'sbfp'
    totalRecords: number
    activeFilters?: Record<string, string | number | undefined>
    summaryMetrics?: {
      totalPacks: number
      totalDelivered: number
      totalTargetPacksToDeliver?: number
      totalVolume: number
      totalRawMilkLiters?: number
      totalWholeMilkKg?: number
      totalSkimmedMilkKg?: number
      totalSugarKg?: number
      totalBeneficiaries: number
      totalMilkCost?: number
      totalServiceFee?: number
      totalFunds: number
      zeroFundsWithMilkCostRows?: number
      zeroFundsWithMilkCostSubtotal?: number
      zeroFundsDetails?: string[]
      centers: string[]
      regionsBreakdown?: string[]
      provincesBreakdown?: string[]
      fundedByBreakdown?: string[]
      regions: string[]
      provinces?: string[]
      fundedBy: string[]
      milkTypes: string[]
      cooperatives?: string[]
    }
    sbfpMetrics?: {
      sdoCount: number
      totalPacks: number
      totalDelivered: number
      pctDelivered: number
      totalContractAmt: number
      totalFunds: number
      totalBeneficiaries: number
      totalCoops: number
      statusBreakdown?: Record<string, number>
      regionalSummary?: string[]
      centerSummary?: string[]
      cooperatives?: string[]
      activeTab?: string
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
    const totalRecords = context?.totalRecords ?? 0
    const activeFilters = context?.activeFilters ?? {}
    const compactTable = context?.compactTable ?? ''

    const filterEntries = Object.entries(activeFilters)
      .filter(([_, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')

    const isSbfp = Boolean(context?.sbfpMetrics || context?.module === 'sbfp')

    let systemPrompt = ''

    if (isSbfp) {
      const sbfp = context?.sbfpMetrics || {
        sdoCount: totalRecords,
        totalPacks: 0,
        totalDelivered: 0,
        pctDelivered: 0,
        totalContractAmt: 0,
        totalFunds: 1121141000,
        totalBeneficiaries: 0,
        totalCoops: 0,
        statusBreakdown: {},
        regionalSummary: [],
        centerSummary: [],
        cooperatives: [],
        activeTab: 'SDO Masterlist',
      }

      const statusBreakdownText =
        sbfp.statusBreakdown && Object.keys(sbfp.statusBreakdown).length > 0
          ? Object.entries(sbfp.statusBreakdown)
              .map(([k, v]) => `- ${k}: ${v} SDOs`)
              .join('\n')
          : 'All'

      const regionalSummaryText =
        sbfp.regionalSummary && sbfp.regionalSummary.length > 0
          ? sbfp.regionalSummary.map(r => `- ${r}`).join('\n')
          : 'All regions'

      const centerSummaryText =
        sbfp.centerSummary && sbfp.centerSummary.length > 0
          ? sbfp.centerSummary.map(c => `- ${c}`).join('\n')
          : 'All centers'

      const coopsText =
        sbfp.cooperatives && sbfp.cooperatives.length > 0
          ? sbfp.cooperatives.map(c => `- ${c}`).join('\n')
          : 'None'

      systemPrompt = `You are the DA-PCC SBFP AI Analyst, an intelligent copilot for the Department of Agriculture - Philippine Carabao Center (DA-PCC) School-Based Feeding Program (SBFP) Monitoring System.

You have access to the exact filtered SDO and milk procurement dataset currently displayed on the user's screen.

### SCOPE & PRE-CALCULATED TOTALS:
- Filtered SDOs in scope: ${sbfp.sdoCount} (Total records: ${totalRecords})
- Active View / Tab: ${sbfp.activeTab || 'SDO Masterlist'}
- Active filters applied: ${filterEntries || 'None (All records in scope)'}
- Key Aggregates:
  * Total Milk Packs Target: ${sbfp.totalPacks.toLocaleString('en-US')}
  * Total Milk Packs Delivered: ${sbfp.totalDelivered.toLocaleString('en-US')}
  * Delivery Completion Rate: ${sbfp.pctDelivered.toFixed(1)}%
  * Total Value of Milk Contracts: ₱${sbfp.totalContractAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  * Total Program Funds: ₱${(sbfp.totalFunds || 1121141000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  * Total Beneficiaries: ${sbfp.totalBeneficiaries.toLocaleString('en-US')}
  * Participating Cooperatives: ${sbfp.totalCoops}

### PROCUREMENT STATUS BREAKDOWN:
${statusBreakdownText}

### REGIONAL SUMMARY BREAKDOWN:
${regionalSummaryText}

### PCC CENTERS BREAKDOWN:
${centerSummaryText}

### PARTICIPATING COOPERATIVES / SUPPLIERS (${sbfp.cooperatives?.length || 0}):
${coopsText}

### SAMPLE SDO ROWS (Pipe-separated table):
${compactTable}

### INSTRUCTIONS:
1. Base your answers strictly on the dataset and pre-calculated aggregates provided above.
2. If asked about SDOs, centers, or cooperatives, reference the specific names and figures from the data.
3. If asked for accomplishment rates, compare delivered packs against target packs.
4. Currency format: "₱" with commas (e.g. ₱1,250,000.00). Quantities format: with commas (e.g. 103,467 packs).
5. Format cleanly using GitHub-flavored Markdown (bullet lists, bold text, or markdown tables).
6. Be concise, direct, professional, and helpful.`
    } else {
      const summary = context?.summaryMetrics || {
        totalPacks: 0,
        totalDelivered: 0,
        totalTargetPacksToDeliver: 0,
        totalVolume: 0,
        totalRawMilkLiters: 0,
        totalWholeMilkKg: 0,
        totalSkimmedMilkKg: 0,
        totalSugarKg: 0,
        totalBeneficiaries: 0,
        totalMilkCost: 0,
        totalServiceFee: 0,
        totalFunds: 0,
        zeroFundsWithMilkCostRows: 0,
        zeroFundsWithMilkCostSubtotal: 0,
        zeroFundsDetails: [],
        centers: [],
        regionsBreakdown: [],
        provincesBreakdown: [],
        fundedByBreakdown: [],
        regions: [],
        provinces: [],
        fundedBy: [],
        milkTypes: [],
        cooperatives: [],
      }

      const coopsText =
        summary.cooperatives && summary.cooperatives.length > 0
          ? summary.cooperatives.map(c => `- ${c}`).join('\n')
          : 'None'

      const centersText =
        summary.centers && summary.centers.length > 0
          ? summary.centers.map(c => `- ${c}`).join('\n')
          : 'All'

      const regionsBreakdownText =
        summary.regionsBreakdown && summary.regionsBreakdown.length > 0
          ? summary.regionsBreakdown.map(r => `- ${r}`).join('\n')
          : 'All'

      const provincesBreakdownText =
        summary.provincesBreakdown && summary.provincesBreakdown.length > 0
          ? summary.provincesBreakdown.map(p => `- ${p}`).join('\n')
          : 'All'

      const fundedByBreakdownText =
        summary.fundedByBreakdown && summary.fundedByBreakdown.length > 0
          ? summary.fundedByBreakdown.map(f => `- ${f}`).join('\n')
          : 'All'

      const zeroFundsNote =
        (summary.zeroFundsWithMilkCostRows ?? 0) > 0
          ? `\n### RECONCILIATION NOTE (Column U vs. Column W):\n- ${summary.zeroFundsWithMilkCostRows} row(s) have Column U (Milk Cost) > 0 but Column W (Total Funds Transferred) = 0, totaling ₱${(summary.zeroFundsWithMilkCostSubtotal ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in Column U.\n${(summary.zeroFundsDetails || []).map(d => `  * ${d}`).join('\n')}`
          : ''

      systemPrompt = `You are the DA-PCC MFP AI Analyst, an intelligent copilot for the Department of Agriculture - Philippine Carabao Center (DA-PCC) Milk Feeding Program (MFP) Monitoring System.

You have access to the exact filtered dataset currently displayed on the user's screen.

### SCOPE & PRE-CALCULATED COLUMN TOTALS (ACROSS ALL ${totalRecords} FILTERED ROWS):
- Total records in scope: ${totalRecords}
- Active filters applied: ${filterEntries || 'None (All records in scope)'}
- Exact Pre-Calculated Column Sums:
  * Column I — Total Milk Packs (milk_packs): ${summary.totalPacks.toLocaleString('en-US')}
  * Column J — Total Volume Requirements (total_volume_requirements): ${summary.totalVolume.toLocaleString('en-US', { maximumFractionDigits: 2 })} L
  * Column K — Raw Milk Used in Liters (raw_milk_liters): ${(summary.totalRawMilkLiters ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} L
  * Column L — Whole Milk (whole_milk_kg): ${(summary.totalWholeMilkKg ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
  * Column M — Skimmed Milk (skimmed_milk_kg): ${(summary.totalSkimmedMilkKg ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
  * Column N — Sugar (sugar): ${(summary.totalSugarKg ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
  * Column Q — Total Beneficiaries (beneficiaries): ${summary.totalBeneficiaries.toLocaleString('en-US')}
  * Column U — Total Milk Cost (milk_cost): ₱${(summary.totalMilkCost ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  * Column V — Total Service Fee / Admin Cost (service_fee): ₱${(summary.totalServiceFee ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  * Column W — Total Funds Transferred (total_funds_transferred): ₱${summary.totalFunds.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  * Column AD — Target Milk Packs to Deliver (target_milk_packs_to_deliver): ${(summary.totalTargetPacksToDeliver ?? summary.totalPacks).toLocaleString('en-US')}
  * Column AE — Total Milk Packs Delivered (total_milk_packs_delivered): ${summary.totalDelivered.toLocaleString('en-US')}
  * Delivery Completion Rate: ${summary.totalPacks > 0 ? ((summary.totalDelivered / summary.totalPacks) * 100).toFixed(1) + '%' : 'N/A'}
  * Funding Sources (Column B): ${summary.fundedBy.join(', ') || 'All'}
  * Regions (Column C): ${summary.regions.join(', ') || 'All'}
  * Milk Types (Column R): ${summary.milkTypes.join(', ') || 'All'}${zeroFundsNote}

### FUNDING SOURCE BREAKDOWN (Column B):
${fundedByBreakdownText}

### CENTERS BREAKDOWN (Column D):
${centersText}

### REGIONS BREAKDOWN (Column C):
${regionsBreakdownText}

### PROVINCES BREAKDOWN (Column E):
${provincesBreakdownText}

### PARTICIPATING COOPERATIVES / SUPPLIERS (Column T — ${summary.cooperatives?.length || 0}):
${coopsText}

### SAMPLE ROWS (Pipe-separated table):
${compactTable}

### INSTRUCTIONS:
1. Base your answers strictly on the dataset and pre-calculated column totals provided above.
2. CRITICAL: Do NOT confuse Column U (Milk Cost), Column V (Service Fee / Admin Cost), and Column W (Total Funds Transferred).
   - When asked for "Column U" or "Milk Cost", always use the pre-calculated Column U total (₱${(summary.totalMilkCost ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).
   - When asked for "Column V" or "Service Fee / Admin Cost", always use the pre-calculated Column V total (₱${(summary.totalServiceFee ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).
   - When asked for "Column W" or "Total Funds Transferred", always use the pre-calculated Column W total (₱${summary.totalFunds.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).
3. If asked about centers, regions, provinces, funding sources, or cooperatives/suppliers, use the pre-calculated breakdown sections above.
4. Currency format: "₱" with commas and two decimals (e.g. ₱137,724,240.00). Quantities format: with commas (e.g. 88,240 packs).
5. Format cleanly using GitHub-flavored Markdown (bullet lists, bold text, or markdown tables).
6. Be concise, direct, professional, and helpful.`
    }

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
