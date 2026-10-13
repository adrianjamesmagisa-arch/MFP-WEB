'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Sparkles,
  Bot,
  Send,
  X,
  Copy,
  Check,
  Settings,
  Trash2,
  AlertCircle,
  Key,
  ExternalLink,
  RotateCw,
} from 'lucide-react'
import type { SbfpReportSourceRow } from '@/lib/sbfp-report-sync'

export interface SbfpAiAgentProps {
  filteredRecords: SbfpReportSourceRow[]
  getViewForSource: (sourceId: string | undefined) => any
  stats: {
    count: number
    rowCount: number
    totalPacks: number
    totalDelivered: number
    pctDelivered: number
    totalContractAmt: number
    totalPaid?: number
    totalBeneficiaries: number
    totalCoops: number
    statusCounts?: Record<string, number>
    [key: string]: any
  }
  yearLabel?: string
  filterCenter?: string
  filterRegion?: string
  filterStatus?: string
  filterMonth?: string
  deliveredDateRange?: string
  searchQuery?: string
  activeTab?: string
  regionalSummary?: Array<{
    region: string
    sdoCount: number
    targetPacks?: number
    deliveredPacks?: number
    pctDelivered?: number
    coopCount?: number
    contractedL?: number
    deliveredL?: number
    [key: string]: any
  }>
  centerSummary?: Array<{
    center: string
    sdoCount: number
    targetPacks?: number
    deliveredPacks?: number
    pctDelivered?: number
    coopCount?: number
    contractedL?: number
    deliveredL?: number
    [key: string]: any
  }>
  implSummary?: {
    buckets: Record<string, any>
    [key: string]: any
  }
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const DEFAULT_MODEL = 'openai/gpt-oss-120b'
const GROQ_MODELS = [
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (High Intelligence · Recommended)' },
  { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B (Fast & Accurate)' },
  { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B (Compact)' },
]

const QUICK_PROMPTS = [
  'Summarize the overall SBFP procurement & delivery accomplishment',
  'Which SDOs and Centers have completed their milk deliveries?',
  'List SDOs that are still "For Preparation" or delayed',
  'Break down delivered packs & completion rate by Region',
  'Which cooperatives are participating and what are their assigned SDOs?',
  'Compare packs to deliver vs delivered packs across PCC Centers',
]

const TAB_LABELS: Record<string, string> = {
  master: 'SDO Masterlist',
  senate_perf: '1. Procurement & Delivery',
  senate_status: '2. Implementation Status',
  senate_region: '3. Regional Distribution',
  senate_center: '4. Center Distribution',
  senate_delivery: '5. Contract & Delivery Details',
  milk_procurement: '6. Milk Procurement Status',
  monthly_cummulated: '7. CDP Report',
}

export function SbfpAiAgent({
  filteredRecords,
  getViewForSource,
  stats,
  yearLabel = 'SY 2026-2027',
  filterCenter = 'ALL',
  filterRegion = 'ALL',
  filterStatus = 'ALL',
  filterMonth = '',
  deliveredDateRange = 'Aug 1 – today',
  searchQuery = '',
  activeTab = 'master',
  regionalSummary = [],
  centerSummary = [],
  implSummary,
}: SbfpAiAgentProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)
  const [inputMessage, setInputMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load saved API key and model from localStorage on mount (shares key with MFP agent)
  useEffect(() => {
    try {
      const savedKey = localStorage.getItem('groq_api_key') || localStorage.getItem('mfp_groq_api_key')
      if (savedKey) setApiKey(savedKey)
      const savedModel = localStorage.getItem('sbfp_groq_model') || localStorage.getItem('mfp_groq_model')
      if (savedModel) setSelectedModel(savedModel)
    } catch {
      // localStorage not accessible
    }
  }, [])

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen, isLoading])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  // Save API key
  const handleSaveApiKey = (keyVal: string) => {
    setApiKey(keyVal)
    try {
      if (keyVal.trim()) {
        localStorage.setItem('groq_api_key', keyVal.trim())
        localStorage.setItem('mfp_groq_api_key', keyVal.trim())
      } else {
        localStorage.removeItem('groq_api_key')
        localStorage.removeItem('mfp_groq_api_key')
      }
    } catch {
      // ignore
    }
  }

  // Save model
  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId)
    try {
      localStorage.setItem('sbfp_groq_model', modelId)
    } catch {
      // ignore
    }
  }

  // Precompute aggregate summaries with low token footprint
  const sbfpContext = useMemo(() => {
    // 1. Cooperative breakdown
    const coopMap = new Map<string, { sdos: Set<string>; packs: number; delivered: number }>()
    filteredRecords.forEach(r => {
      const v = getViewForSource(r.id)
      const coopName = v?.coop_name?.trim()
      if (coopName && coopName !== '—' && coopName !== '-') {
        const prev = coopMap.get(coopName) || { sdos: new Set(), packs: 0, delivered: 0 }
        if (r.sdo) prev.sdos.add(String(r.sdo))
        prev.packs += v?.packs_to_deliver || 0
        prev.delivered += v?.delivered_packs || 0
        coopMap.set(coopName, prev)
      }
    })

    const coopsList = Array.from(coopMap.entries())
      .sort((a, b) => b[1].packs - a[1].packs)
      .slice(0, 30)
      .map(
        ([name, data]) =>
          `${name} (${data.sdos.size} SDOs, ${data.packs.toLocaleString('en-US')} packs target, ${data.delivered.toLocaleString('en-US')} delivered)`,
      )

    // 2. Regional summary
    const regList = (regionalSummary || [])
      .map(r => {
        const target = r.targetPacks ?? r.contractedL ?? 0
        const delivered = r.deliveredPacks ?? r.deliveredL ?? 0
        const pct = r.pctDelivered ?? (target > 0 ? (delivered / target) * 100 : 0)
        return `Region ${r.region}: ${r.sdoCount} SDOs, target: ${target.toLocaleString('en-US')} packs, delivered: ${delivered.toLocaleString('en-US')} (${pct.toFixed(1)}%), ${r.coopCount ?? 0} coops`
      })
      .slice(0, 20)

    // 3. Center summary
    const centerList = (centerSummary || [])
      .map(c => {
        const target = c.targetPacks ?? c.contractedL ?? 0
        const delivered = c.deliveredPacks ?? c.deliveredL ?? 0
        const pct = c.pctDelivered ?? (target > 0 ? (delivered / target) * 100 : 0)
        return `${c.center}: ${c.sdoCount} SDOs, target: ${target.toLocaleString('en-US')} packs, delivered: ${delivered.toLocaleString('en-US')} (${pct.toFixed(1)}%), ${c.coopCount ?? 0} coops`
      })
      .slice(0, 20)

    // 4. Status breakdown
    const statusBreakdown: Record<string, number> = {}
    if (implSummary?.buckets) {
      Object.entries(implSummary.buckets).forEach(([status, b]: [string, any]) => {
        statusBreakdown[status] = b.sdoCount || 0
      })
    } else if (stats.statusCounts) {
      Object.assign(statusBreakdown, stats.statusCounts)
    }

    // 5. Ultra-compact pipe-delimited sample rows (~15 tokens per row)
    const header = 'Region|SDO|Center|Coop|Status|Milk|Target|Deliv|ContractAmt'
    const rows = filteredRecords.slice(0, 40).map(r => {
      const v = getViewForSource(r.id)
      const reg = v?.region || r.region || '-'
      const sdo = v?.sdo || r.sdo || '-'
      const center = v?.center || r.center || '-'
      const coop = v?.coop_name || '-'
      const status = v?.procurement_status || r.procurement_status || '-'
      const milk = v?.milk_type || r.milk_type || '-'
      const target = v?.packs_to_deliver ?? 0
      const deliv = v?.delivered_packs ?? 0
      const amt = v?.contract_amount ?? (Number(r.contract_amount) || 0)
      const amtStr = amt > 0 ? `₱${(amt / 1e6).toFixed(2)}M` : '-'
      return `${reg}|${sdo}|${center}|${coop}|${status}|${milk}|${target}|${deliv}|${amtStr}`
    })
    const compactTable = [header, ...rows].join('\n')

    return {
      cooperatives: coopsList,
      regionalSummary: regList,
      centerSummary: centerList,
      statusBreakdown,
      compactTable,
    }
  }, [filteredRecords, getViewForSource, stats, regionalSummary, centerSummary, implSummary])

  // Send prompt to Groq API
  const handleSend = async (textToSend?: string) => {
    const prompt = (textToSend || inputMessage).trim()
    if (!prompt || isLoading) return

    setErrorMessage(null)
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInputMessage('')
    setIsLoading(true)

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (apiKey.trim()) {
        headers['x-groq-api-key'] = apiKey.trim()
      }

      // Send last 4 messages to preserve Groq token budget
      const trimmedHistory = newMessages.slice(-4).map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: trimmedHistory,
          model: selectedModel,
          context: {
            module: 'sbfp',
            totalRecords: filteredRecords.length,
            activeFilters: {
              'School Year': yearLabel,
              Center: filterCenter === 'ALL' ? 'All Centers' : filterCenter,
              Region: filterRegion === 'ALL' ? 'All Regions' : `Region ${filterRegion}`,
              'Procurement Status': filterStatus === 'ALL' ? 'All Statuses' : filterStatus,
              'Delivery Month': filterMonth || 'All Months',
              'Delivered Date Range': deliveredDateRange,
              Search: searchQuery || undefined,
              'Active View Tab': TAB_LABELS[activeTab] || activeTab,
            },
            sbfpMetrics: {
              sdoCount: stats.count,
              totalPacks: stats.totalPacks,
              totalDelivered: stats.totalDelivered,
              pctDelivered: stats.pctDelivered,
              totalContractAmt: stats.totalContractAmt,
              totalFunds: 1121141000,
              totalBeneficiaries: stats.totalBeneficiaries,
              totalCoops: stats.totalCoops,
              statusBreakdown: sbfpContext.statusBreakdown,
              regionalSummary: sbfpContext.regionalSummary,
              centerSummary: sbfpContext.centerSummary,
              cooperatives: sbfpContext.cooperatives,
              activeTab: TAB_LABELS[activeTab] || activeTab,
            },
            compactTable: sbfpContext.compactTable,
          },
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.requiresKey) {
          setShowSettings(true)
        }
        throw new Error(data.error || 'Failed to generate response from Groq AI.')
      }

      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.content,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages(prev => [...prev, assistantMsg])
    } catch (err: any) {
      console.error('SBFP AI chat error:', err)
      setErrorMessage(err.message || 'Error communicating with Groq AI.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const clearChat = () => {
    if (confirm('Clear chat conversation?')) {
      setMessages([])
      setErrorMessage(null)
    }
  }

  return (
    <>
      {/* 1. Header Trigger Button (Placed beside Reset & Export buttons) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Ask AI questions about the filtered SBFP SDO data and report metrics"
        style={{
          height: 34,
          padding: '0 0.85rem',
          borderRadius: 6,
          border: '1px solid #1e3a8a',
          background: 'linear-gradient(135deg, #0a1628 0%, #1e3a6e 50%, #2563eb 100%)',
          color: '#ffffff',
          fontSize: '0.82rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)',
          transition: 'all 0.15s ease',
        }}
      >
        <Sparkles size={14} color="#fbbf24" style={{ filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.6))' }} />
        <span>AI Agent</span>
        <span
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            color: '#fef3c7',
            fontSize: '0.68rem',
            padding: '0.05rem 0.4rem',
            borderRadius: '999px',
            fontWeight: 700,
          }}
        >
          {stats.count}
        </span>
      </button>

      {/* 2. Slide-over Copilot Drawer */}
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
          {/* Subtle backdrop overlay */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(10, 22, 40, 0.35)',
              backdropFilter: 'blur(2px)',
              transition: 'opacity 0.2s',
            }}
          />

          {/* Drawer container */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 500,
              maxWidth: '100vw',
              background: '#ffffff',
              boxShadow: '-8px 0 24px rgba(10, 22, 40, 0.18)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 75,
              borderLeft: '1px solid #e2e8f0',
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '1rem 1.25rem',
                background: 'linear-gradient(135deg, #0a1628 0%, #162d55 100%)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div
                  style={{
                    background: 'rgba(245, 166, 35, 0.2)',
                    border: '1px solid #f5a623',
                    padding: '0.4rem',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sparkles size={18} color="#f5a623" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'white' }}>SBFP AI Agent</h2>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        background: '#2563eb',
                        color: 'white',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '4px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Groq
                    </span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#cbd5e1', margin: '0.1rem 0 0 0' }}>
                    {stats.count} SDO{stats.count !== 1 ? 's' : ''} · {filteredRecords.length} records in scope
                  </p>
                </div>
              </div>

              {/* Header Action buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => setShowSettings(!showSettings)}
                  title="Groq API Key & Model Settings"
                  style={{
                    background: showSettings ? 'rgba(255,255,255,0.2)' : 'transparent',
                    border: 'none',
                    color: 'white',
                    padding: '0.4rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Settings size={16} />
                </button>
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={clearChat}
                    title="Clear Conversation"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#fca5a5',
                      padding: '0.4rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  title="Close Assistant"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    padding: '0.4rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scope / Context Banner */}
            <div
              style={{
                background: '#f8fafc',
                padding: '0.5rem 1rem',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: '#64748b',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontWeight: 600, color: '#0f172a' }}>Scope:</span>
                <span>
                  {yearLabel} · {filterCenter === 'ALL' ? 'All Centers' : filterCenter} ·{' '}
                  {filterRegion === 'ALL' ? 'All Regions' : `Region ${filterRegion}`} ·{' '}
                  {TAB_LABELS[activeTab] || activeTab}
                </span>
              </div>
              <span style={{ fontWeight: 700, color: '#059669' }}>
                {stats.pctDelivered.toFixed(1)}% delivered
              </span>
            </div>

            {/* Collapsible Groq Settings Bar */}
            {showSettings && (
              <div
                style={{
                  background: '#f1f5f9',
                  borderBottom: '1px solid #cbd5e1',
                  padding: '0.85rem 1rem',
                  fontSize: '0.8rem',
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    color: '#0f172a',
                    marginBottom: '0.4rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <Key size={14} color="#2563eb" /> Groq API Configuration
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#475569', marginBottom: '0.2rem' }}>
                    Groq API Key (starts with <code>gsk_...</code>):
                  </label>
                  <input
                    type="password"
                    placeholder="gsk_..."
                    value={apiKey}
                    onChange={e => handleSaveApiKey(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.6rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      background: 'white',
                    }}
                  />
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: '#64748b',
                      marginTop: '0.25rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>Leave empty if defined in <code>.env.local</code></span>
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      Get Free Key <ExternalLink size={10} />
                    </a>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#475569', marginBottom: '0.2rem' }}>
                    Model:
                  </label>
                  <select
                    value={selectedModel}
                    onChange={e => handleSelectModel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.6rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.78rem',
                      background: 'white',
                    }}
                  >
                    {GROQ_MODELS.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Error Message Toast */}
            {errorMessage && (
              <div
                style={{
                  background: '#fef2f2',
                  borderBottom: '1px solid #fecaca',
                  color: '#991b1b',
                  padding: '0.65rem 1rem',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>{errorMessage}</div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', padding: 0 }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Chat Body & Conversation */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                background: '#fafafa',
              }}
            >
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem' }}>
                  <div
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: '50%',
                      background: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 1rem',
                    }}
                  >
                    <Bot size={26} color="#2563eb" />
                  </div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.35rem', color: '#0f172a' }}>
                    SBFP Intelligence Copilot
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 1.25rem', lineHeight: 1.4 }}>
                    Ask questions grounded on the <strong>{stats.count} SDOs</strong> and live monitoring metrics visible
                    on your screen.
                  </p>

                  {/* Quick Prompts List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', textAlign: 'left' }}>
                    <div
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        marginBottom: '0.1rem',
                      }}
                    >
                      Suggested Prompts:
                    </div>
                    {QUICK_PROMPTS.map((qp, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSend(qp)}
                        style={{
                          background: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '0.55rem 0.75rem',
                          fontSize: '0.78rem',
                          color: '#1e293b',
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          transition: 'all 0.15s ease',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#2563eb'
                          e.currentTarget.style.background = '#f8fafc'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = '#e2e8f0'
                          e.currentTarget.style.background = 'white'
                        }}
                      >
                        <Sparkles size={12} color="#2563eb" style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{qp}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '92%',
                        borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        padding: '0.75rem 0.95rem',
                        background: msg.role === 'user' ? '#1e3a8a' : '#ffffff',
                        color: msg.role === 'user' ? '#ffffff' : '#0f172a',
                        border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        fontSize: '0.82rem',
                        lineHeight: 1.5,
                        position: 'relative',
                        wordBreak: 'break-word',
                      }}
                    >
                      {msg.role === 'assistant' ? (
                        <MarkdownView content={msg.content} />
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        marginTop: '0.25rem',
                        fontSize: '0.68rem',
                        color: '#94a3b8',
                      }}
                    >
                      <span>{msg.timestamp}</span>
                      {msg.role === 'assistant' && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(msg.id, msg.content)}
                          title="Copy response to clipboard"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: copiedId === msg.id ? '#059669' : '#94a3b8',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            padding: '0 0.2rem',
                          }}
                        >
                          {copiedId === msg.id ? <Check size={11} /> : <Copy size={11} />}
                          <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}

              {isLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0' }}>
                  <div
                    style={{
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px 12px 12px 2px',
                      padding: '0.65rem 0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.78rem',
                      color: '#475569',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    }}
                  >
                    <RotateCw size={14} className="animate-spin" color="#2563eb" style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Analyzing SBFP monitoring data...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar Footer */}
            <div
              style={{
                padding: '0.75rem 1rem',
                background: '#ffffff',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'flex-end',
              }}
            >
              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about SDOs, completion rates, coops, or centers..."
                disabled={isLoading}
                rows={2}
                style={{
                  flex: 1,
                  resize: 'none',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.82rem',
                  outline: 'none',
                  fontFamily: 'inherit',
                  lineHeight: 1.4,
                }}
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!inputMessage.trim() || isLoading}
                style={{
                  height: 40,
                  width: 40,
                  borderRadius: '8px',
                  background: !inputMessage.trim() || isLoading ? '#94a3b8' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  cursor: !inputMessage.trim() || isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.15s ease',
                }}
                title="Send message"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Lightweight Markdown renderer supporting tables, headers, lists, code, and bold text.
 */
function MarkdownView({ content }: { content: string }) {
  const renderedElements = useMemo(() => {
    const lines = content.split('\n')
    const elements: React.ReactNode[] = []
    let inTable = false
    let tableRows: string[][] = []

    const flushTable = (keyIdx: number) => {
      if (tableRows.length === 0) return null
      const [headerRow, ...bodyRows] = tableRows
      return (
        <div key={`table-${keyIdx}`} style={{ overflowX: 'auto', margin: '0.6rem 0', maxWidth: '100%' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.75rem',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
            }}
          >
            {headerRow && (
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {headerRow.map((cell, cIdx) => (
                    <th
                      key={cIdx}
                      style={{
                        border: '1px solid #cbd5e1',
                        padding: '4px 6px',
                        textAlign: 'left',
                        fontWeight: 700,
                        color: '#0f172a',
                        fontSize: '0.72rem',
                      }}
                    >
                      {formatInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      style={{
                        border: '1px solid #cbd5e1',
                        padding: '3px 6px',
                        color: '#334155',
                      }}
                    >
                      {formatInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    let i = 0
    while (i < lines.length) {
      const line = lines[i]

      // Check for table row
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const cells = line
          .split('|')
          .slice(1, -1)
          .map(c => c.trim())

        // Check if separator line (e.g. |---|---|)
        if (cells.every(c => /^[-:]+$/.test(c))) {
          i++
          continue
        }

        tableRows.push(cells)
        inTable = true
        i++
        continue
      } else if (inTable) {
        elements.push(flushTable(i))
        tableRows = []
        inTable = false
      }

      // Headers
      if (line.startsWith('### ')) {
        elements.push(
          <h4 key={i} style={{ fontSize: '0.88rem', fontWeight: 700, margin: '0.55rem 0 0.2rem 0', color: '#0f172a' }}>
            {formatInline(line.replace('### ', ''))}
          </h4>,
        )
      } else if (line.startsWith('## ')) {
        elements.push(
          <h3 key={i} style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0.7rem 0 0.25rem 0', color: '#0f172a' }}>
            {formatInline(line.replace('## ', ''))}
          </h3>,
        )
      } else if (line.startsWith('# ')) {
        elements.push(
          <h2 key={i} style={{ fontSize: '1.02rem', fontWeight: 700, margin: '0.8rem 0 0.3rem 0', color: '#0f172a' }}>
            {formatInline(line.replace('# ', ''))}
          </h2>,
        )
      }
      // Bullet list items
      else if (/^[-*]\s/.test(line.trim())) {
        elements.push(
          <div key={i} style={{ display: 'flex', gap: '0.4rem', margin: '0.2rem 0', paddingLeft: '0.4rem' }}>
            <span style={{ color: '#2563eb', fontWeight: 700 }}>•</span>
            <span>{formatInline(line.trim().replace(/^[-*]\s/, ''))}</span>
          </div>,
        )
      }
      // Numbered list items
      else if (/^\d+\.\s/.test(line.trim())) {
        const num = line.trim().match(/^(\d+)\.\s/)?.[1]
        elements.push(
          <div key={i} style={{ display: 'flex', gap: '0.4rem', margin: '0.2rem 0', paddingLeft: '0.4rem' }}>
            <span style={{ color: '#2563eb', fontWeight: 600, minWidth: '1.1rem' }}>{num}.</span>
            <span>{formatInline(line.trim().replace(/^\d+\.\s/, ''))}</span>
          </div>,
        )
      }
      // Empty lines
      else if (!line.trim()) {
        elements.push(<div key={i} style={{ height: '0.35rem' }} />)
      }
      // Regular paragraph
      else {
        elements.push(
          <p key={i} style={{ margin: '0.25rem 0', lineHeight: 1.5 }}>
            {formatInline(line)}
          </p>,
        )
      }

      i++
    }

    if (inTable && tableRows.length > 0) {
      elements.push(flushTable(i))
    }

    return elements
  }, [content])

  return <div>{renderedElements}</div>
}

/**
 * Format inline bold (**text**), italics (*text*), and backtick code (`code`)
 */
function formatInline(str: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let lastIdx = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(str)) !== null) {
    if (match.index > lastIdx) {
      parts.push(str.substring(lastIdx, match.index))
    }

    const chunk = match[0]
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      parts.push(
        <strong key={match.index} style={{ fontWeight: 700, color: '#0f172a' }}>
          {chunk.slice(2, -2)}
        </strong>,
      )
    } else if (chunk.startsWith('`') && chunk.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          style={{
            background: '#f1f5f9',
            color: '#0f172a',
            padding: '0.1rem 0.3rem',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontFamily: 'monospace',
          }}
        >
          {chunk.slice(1, -1)}
        </code>,
      )
    } else if (chunk.startsWith('*') && chunk.endsWith('*')) {
      parts.push(<em key={match.index}>{chunk.slice(1, -1)}</em>)
    }

    lastIdx = regex.lastIndex
  }

  if (lastIdx < str.length) {
    parts.push(str.substring(lastIdx))
  }

  return parts.length > 0 ? parts : str
}
