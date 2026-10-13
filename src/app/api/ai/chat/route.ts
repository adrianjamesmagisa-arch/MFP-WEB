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
    programType?: 'sbfp' | 'mfp'
    activeTab?: { id: string; label: string }
    schoolYear?: string
    // SBFP specific:
    stats?: {
      count: number
      rowCount: number
      totalPacks: number
      totalDelivered: number
      pctDelivered: number
      totalContractAmt: number
      totalFunds?: number
      totalBeneficiaries: number
      totalCoops: number
      totalPaid?: number
      totalRemainingPay?: number
      totalContractedL?: number
      totalDeliveredL?: number
      totalUndeliveredL?: number
      totalValueDelivered?: number
    }
    statusBreakdown?: Record<string, number>
    regionalSummary?: Array<{
      region: string
      sdoCount: number
      coopCount: number
      targetPacks: number
      deliveredPacks: number
      pctDelivered: number
      contractAmt: number
    }>
    centerSummary?: Array<{
      center: string
      sdoCount: number
      coopCount: number
      targetPacks: number
      deliveredPacks: number
      pctDelivered: number
      contractAmt: number
    }>
    cooperatives?: string[]
    // Generic MFP fields:
    totalRecords?: number
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

    // 4. Construct grounded system prompt with token optimization
    const activeFilters = context?.activeFilters ?? {}
    const compactTable = context?.compactTable ?? ''
    const filterEntries = Object.entries(activeFilters)
      .filter(([_, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')

    let systemPrompt = ''

    if (context?.programType === 'sbfp') {
      const activeTabLabel = context.activeTab?.label || 'SDO Masterlist'
      const activeTabId = context.activeTab?.id || 'master'
      const schoolYear = context.schoolYear || 'SY 2026-2027'
      const sbfpStats = context.stats || {
        count: 0,
        rowCount: 0,
        totalPacks: 0,
        totalDelivered: 0,
        pctDelivered: 0,
        totalContractAmt: 0,
        totalFunds: 1121141000,
        totalBeneficiaries: 0,
        totalCoops: 0,
        totalPaid: 0,
        totalRemainingPay: 0,
        totalContractedL: 0,
        totalDeliveredL: 0,
      }

      // Compact regional distribution text
      const regLines = (context.regionalSummary || [])
        .slice(0, 18)
        .map(
          r =>
            `${r.region}: ${r.sdoCount} SDOs, ${r.coopCount} coops | Packs: ${r.deliveredPacks.toLocaleString()}/${r.targetPacks.toLocaleString()} (${r.pctDelivered.toFixed(1)}%) | ₱${(r.contractAmt / 1e6).toFixed(2)}M`,
        )
        .join('\n')

      // Compact center distribution text
      const centerLines = (context.centerSummary || [])
        .slice(0, 14)
        .map(
          c =>
            `${c.center}: ${c.sdoCount} SDOs, ${c.coopCount} coops | Packs: ${c.deliveredPacks.toLocaleString()}/${c.targetPacks.toLocaleString()} (${c.pctDelivered.toFixed(1)}%) | ₱${(c.contractAmt / 1e6).toFixed(2)}M`,
        )
        .join('\n')

      // Status breakdown
      const statusText = context.statusBreakdown
        ? Object.entries(context.statusBreakdown)
            .map(([k, v]) => `${k}: ${v} SDOs`)
            .join(', ')
        : 'None'

      // Top coops
      const coopsText =
        (context.cooperatives || [])
          .slice(0, 25)
          .map(c => `- ${c}`)
          .join('\n') || 'None recorded'

      systemPrompt = `You are the DA-PCC SBFP AI Analyst & Program Copilot, an expert AI embedded into the Department of Agriculture - Philippine Carabao Center (DA-PCC) School-Based Feeding Program (SBFP) Monitoring System.

### OFFICIAL GROUND TRUTH:
The SBFP monitoring dataset and report currently displayed on screen is your SOLE SOURCE OF TRUTH. Always answer user queries based on this verified data.

### PROGRAM CONTEXT:
- Program: DA-PCC School-Based Feeding Program (SBFP), partnered with DepEd (Department of Education).
- Goal: Deliver fresh, nutritious local carabao milk to school children across the Philippines.
- Legal & Procurement Basis: RA 11037 (Masustansyang Pagkain para sa Batang Pilipino) and RA 11321 (Sagip Saka Act / Negotiated Procurement - Community Participation).
- Milk Types:
  * PM = Pasteurized Milk (200ml, chilled, 5 packs = 1 Liter)
  * SM = Sterilized Milk / Retort Pouch (shelf-stable, 5.5555 packs = 1 Liter)
  * CM = Choco Milk (pasteurized flavored, 5 packs = 1 Liter)
- 13 PCC Centers: NHQ, CLSU, UPLB, DMMMSU, CSU, MMSU, LCSF, WVSU, USF, VSU, MLPC, CMU, USM.

### THE 8 SBFP REPORT TABS (YOU KNOW ALL 8 TABS):
1. 'SDO Masterlist' (tab: master): Complete division masterlist with cooperatives, contract amounts, Sagip Saka mode, PR/ORS/PO details, batches, delivery periods, packs, and payment statuses (Obligated, etc.).
2. '1. Procurement & Delivery' (tab: senate_perf): Oversight performance metrics: Contract values, contracted vs delivered volumes (in Liters), amounts paid/disbursed, accomplishment % rate.
3. '2. Implementation Status' (tab: senate_status): Procurement pipeline milestones: For Preparation, Ongoing Procurement, Ongoing (For Award), Awarded (For Delivery), Awarded (Ongoing Delivery), Completed, Failed. SDO counts and volume per status.
4. '3. Regional Distribution' (tab: senate_region): Regional breakdown across 17 Philippine regions (CAR, I, II, III, IV-A, IV-B, V, NCR, VI, VII, NIR, VIII, IX, X, XI, XII, CARAGA, BARMM): SDO counts, coops, packs, accomplishment %, contract values.
5. '4. Center Distribution' (tab: senate_center): Breakdown across the 13 PCC Centers: SDOs covered, participating coops, target packs, delivered packs, delivery accomplishment %, contract funds.
6. '5. Contract & Delivery Details' (tab: senate_delivery): Granular contract & delivery records per SDO: PR/PO numbers, ORS dates, mode of procurement, delivery start & end dates, contract amounts, contracted vs delivered liters, completion status.
7. '6. Milk Procurement Status' (tab: milk_procurement): Milk procurement progress as of selected cut-off month & year: pasteurized vs sterilized breakdown, fresh carabao milk utilized (in liters), farmer engagement.
8. '7. CDP Report' (tab: monthly_cummulated): Cumulative Delivery Performance (CDP) & Monthly Cumulated report: month-by-month delivery volume progressions (Jan-Dec), monthly targets vs actuals, cluster breakdown (Luzon, Visayas, Mindanao).

### CURRENT VIEW & SCOPE:
- CURRENTLY ACTIVE TAB: "${activeTabLabel}" (${activeTabId})
- Active School Year: ${schoolYear}
- Active Filters: ${filterEntries || 'None (All SDOs in scope)'}

### KEY KPI METRICS:
- Filtered SDOs (Divisions): ${sbfpStats.count} (Total records: ${sbfpStats.rowCount})
- Target Milk Packs: ${sbfpStats.totalPacks.toLocaleString('en-US')}
- Delivered Milk Packs: ${sbfpStats.totalDelivered.toLocaleString('en-US')} (${sbfpStats.pctDelivered.toFixed(1)}% accomplished)
- Total Contract Amount: ₱${sbfpStats.totalContractAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Total Program Funds: ₱${(sbfpStats.totalFunds || 1121141000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Target Beneficiaries: ${sbfpStats.totalBeneficiaries.toLocaleString('en-US')}
- Participating Cooperatives: ${sbfpStats.totalCoops}
- Delivered Volume (L): ${(sbfpStats.totalDeliveredL || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} L
- Contracted Volume (L): ${(sbfpStats.totalContractedL || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })} L
- Actual Amount Paid: ₱${(sbfpStats.totalPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Remaining to Pay: ₱${(sbfpStats.totalRemainingPay || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

### STATUS BREAKDOWN:
${statusText}

### REGIONAL SUMMARY:
${regLines || 'None'}

### CENTER SUMMARY:
${centerLines || 'None'}

### PARTICIPATING COOPERATIVES (${context.cooperatives?.length || sbfpStats.totalCoops}):
${coopsText}

### SDO DIVISION RECORDS (Pipe-delimited sample):
${compactTable}

### INSTRUCTIONS:
1. Ground every answer strictly in the official data above. Do not invent numbers.
2. State which of the 8 tabs contains the relevant details when applicable.
3. If asked about the currently active tab (${activeTabLabel}), explain what it shows and highlight key figures from it.
4. Currency format: "₱" with commas (e.g. ₱1,005,479,489.00). Quantities: formatted with commas (e.g. 39,946,886 packs).
5. Format responses using GitHub-flavored Markdown (bullet lists, bold highlights, tables when comparing multiple items).
6. Be concise, direct, professional, and helpful.`
    } else {
      // General MFP context
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

      const coopsText =
        summary.cooperatives && summary.cooperatives.length > 0
          ? summary.cooperatives.map(c => `- ${c}`).join('\n')
          : 'None'

      const centersText =
        summary.centers && summary.centers.length > 0
          ? summary.centers.map(c => `- ${c}`).join('\n')
          : 'All'

      systemPrompt = `You are the DA-PCC MFP AI Analyst, an intelligent copilot for the Department of Agriculture - Philippine Carabao Center (DA-PCC) Milk Feeding Program (MFP) Monitoring System.

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
