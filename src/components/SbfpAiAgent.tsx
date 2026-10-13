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
  ChevronDown,
  RotateCw,
  Table,
} from 'lucide-react'

export interface SbfpAiAgentProps {
  records: any[]
  allRecords?: any[]
  stats: {
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
    statusCounts?: Record<string, number>
  }
  activeTab: string
  activeTabLabel: string
  schoolYearLabel: string
  year: string
  filterCenter?: string
  filterRegion?: string
  filterStatus?: string
  filterMonth?: string
  searchQuery?: string
  deliveredDateFilterEnabled?: boolean
  deliveredFrom?: string
  deliveredTo?: string
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
  'Summarize overall SBFP procurement & delivery progress',
  'Explain what data is in the 8 report tabs and what my active tab shows',
  'Which SDOs have completed delivery vs still in preparation?',
  'Top cooperatives by contract amount & delivered packs',
  'Breakdown of packs and delivery status by PCC Center',
  'Regional distribution summary: which regions have the highest target packs?',
]

export function SbfpAiAgent({
  records,
  allRecords,
  stats,
  activeTab,
  activeTabLabel,
  schoolYearLabel,
  year,
  filterCenter,
  filterRegion,
  filterStatus,
  filterMonth,
  searchQuery,
  deliveredDateFilterEnabled,
  deliveredFrom,
  deliveredTo,
  regionalSummary = [],
  centerSummary = [],
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

  // Load saved API key and model from localStorage (shares key with MFP agent)
  useEffect(() => {
    try {
      const savedKey = localStorage.getItem('mfp_groq_api_key')
      if (savedKey) setApiKey(savedKey)
      const savedModel = localStorage.getItem('mfp_groq_model')
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

  // Focus input when drawer opens
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
        localStorage.setItem('mfp_groq_api_key', keyVal.trim())
      } else {
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
      localStorage.setItem('mfp_groq_model', modelId)
    } catch {
      // ignore
    }
  }

  // Deduplicate and aggregate participating cooperatives from records
  const coopsList = useMemo(() => {
    const coopsMap = new Map<string, { packs: number; delivered: number; contractAmt: number; sdos: Set<string> }>()
    for (const r of records) {
      const coopName = (r.cooperatives as any)?.name || r.supplier_id || r.coop_name || null
      if (!coopName || coopName === '—' || coopName === '-') continue
      const packs = Number(r.packs_to_deliver) || 0
      const delivered = Number(r.packs_delivered) || 0
      const amt = Number(r.contract_amount) || Number(r.amount) || 0
      const prev = coopsMap.get(coopName) || { packs: 0, delivered: 0, contractAmt: 0, sdos: new Set<string>() }
      if (r.sdo) prev.sdos.add(String(r.sdo))
      coopsMap.set(coopName, {
        packs: prev.packs + packs,
        delivered: prev.delivered + delivered,
        contractAmt: prev.contractAmt + amt,
        sdos: prev.sdos,
      })
    }

    return Array.from(coopsMap.entries())
      .sort((a, b) => b[1].packs - a[1].packs)
      .map(([name, stat]) => `${name} (${stat.sdos.size} SDOs, ${stat.packs.toLocaleString()} packs, ₱${(stat.contractAmt / 1e6).toFixed(2)}M)`)
      .slice(0, 30)
  }, [records])

  // Ultra-compact pipe-delimited sample table (~15 tokens per row)
  const compactTable = useMemo(() => {
    const header = 'SDO|Region|Center|Coop|Status|Milk|ContractAmt|PacksTarget|Delivered'
    const rows = records.slice(0, 35).map(r => {
      const sdo = String(r.sdo || '').replace(/\|/g, '')
      const reg = String(r.region || '')
      const center = String(r.center || '')
      const coop = String((r.cooperatives as any)?.name || r.supplier_id || '-').slice(0, 20).replace(/\|/g, '')
      const status = String(r.procurement_status || 'For Preparation').replace(/\|/g, '')
      const milk = String(r.milk_type || 'PM')
      const amt = Number(r.contract_amount) || Number(r.amount) || 0
      const targetPacks = Number(r.packs_to_deliver) || 0
      const delivPacks = Number(r.packs_delivered) || 0
      return `${sdo}|${reg}|${center}|${coop}|${status}|${milk}|${amt}|${targetPacks}|${delivPacks}`
    })
    return [header, ...rows].join('\n')
  }, [records])

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

      // Send only last 4 messages to stay strictly within Groq's 8,000 TPM limit
      const trimmedHistory = newMessages.slice(-4).map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: trimmedHistory,
          model: selectedModel,
          context: {
            programType: 'sbfp',
            activeTab: {
              id: activeTab,
              label: activeTabLabel,
            },
            schoolYear: schoolYearLabel,
            stats: {
              count: stats.count,
              rowCount: stats.rowCount,
              totalPacks: stats.totalPacks,
              totalDelivered: stats.totalDelivered,
              pctDelivered: stats.pctDelivered,
              totalContractAmt: stats.totalContractAmt,
              totalFunds: stats.totalFunds || 1121141000,
              totalBeneficiaries: stats.totalBeneficiaries,
              totalCoops: stats.totalCoops,
              totalPaid: stats.totalPaid,
              totalRemainingPay: stats.totalRemainingPay,
              totalContractedL: stats.totalContractedL,
              totalDeliveredL: stats.totalDeliveredL,
              totalUndeliveredL: stats.totalUndeliveredL,
            },
            statusBreakdown: stats.statusCounts,
            regionalSummary,
            centerSummary,
            cooperatives: coopsList,
            activeFilters: {
              center: filterCenter !== 'ALL' ? filterCenter : undefined,
              region: filterRegion !== 'ALL' ? filterRegion : undefined,
              status: filterStatus !== 'ALL' ? filterStatus : undefined,
              month: filterMonth ? `Month ${filterMonth}` : undefined,
              search: searchQuery || undefined,
              deliveryDateRange: deliveredDateFilterEnabled ? `${deliveredFrom} to ${deliveredTo}` : undefined,
            },
            compactTable,
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
    } catch (err) {
      console.error('SBFP AI Agent error:', err)
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred while contacting AI.')
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
    setMessages([])
    setErrorMessage(null)
  }

  return (
    <>
      {/* 1. Trigger Button beside Export as .CSV */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title={`Ask SBFP AI Assistant about ${stats.count} SDOs and active tab data`}
        style={{
          height: 34,
          padding: '0 0.85rem',
          borderRadius: 6,
          border: '1px solid #1e3a8a',
          background: 'linear-gradient(135deg, #0a1628 0%, #1e3a8a 100%)',
          color: '#ffffff',
          fontSize: '0.85rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(30, 58, 138, 0.25)',
          transition: 'all 0.15s ease',
        }}
      >
        <Sparkles size={15} color="#fbbf24" style={{ filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.7))' }} />
        <span>AI Agent</span>
        <span
          style={{
            background: 'rgba(255, 255, 255, 0.22)',
            color: '#fef3c7',
            fontSize: '0.7rem',
            padding: '0.1rem 0.45rem',
            borderRadius: 999,
            fontWeight: 700,
          }}
        >
          {stats.count} SDOs
        </span>
      </button>

      {/* 2. Slide-over Copilot Drawer */}
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
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
              zIndex: 85,
              borderLeft: '1px solid #e2e8f0',
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '1rem 1.25rem',
                background: 'linear-gradient(135deg, #0a1628 0%, #1e293b 100%)',
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
                    {schoolYearLabel} · {stats.count} SDOs · Tab: {activeTabLabel}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
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

            {/* Scope / Context Pill Banner */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>Active Tab:</span>
                <span style={{ color: '#2563eb', fontWeight: 600 }}>{activeTabLabel}</span>
                <span>·</span>
                <span>{filterCenter && filterCenter !== 'ALL' ? filterCenter : 'All Centers'}</span>
                {filterRegion && filterRegion !== 'ALL' && <span>· Reg {filterRegion}</span>}
              </div>
              <span style={{ fontWeight: 700, color: '#b45309' }}>
                ₱{(stats.totalContractAmt / 1e6).toFixed(1)}M
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
                <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
                    onChange={(e) => handleSaveApiKey(e.target.value)}
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
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Leave empty if defined in <code>.env.local</code></span>
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      Get Key <ExternalLink size={10} />
                    </a>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: '#475569', marginBottom: '0.2rem' }}>
                    Model:
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => handleSelectModel(e.target.value)}
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
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Chat Messages Body */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
                background: '#fafafa',
              }}
            >
              {/* If no messages yet: Welcome Screen */}
              {messages.length === 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '1.25rem 1rem',
                      background: 'white',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      marginBottom: '1rem',
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #0a1628 0%, #1e3a8a 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 0.75rem auto',
                      }}
                    >
                      <Bot size={24} color="white" />
                    </div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.25rem 0' }}>
                      SBFP Monitoring Knowledge Assistant
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                      Authoritative intelligence grounded in the SBFP Monitoring dataset. Aware of all 8 tabs, SDO procurement, and delivery accomplishments across your {stats.count} currently filtered divisions.
                    </p>
                  </div>

                  {/* Quick prompt suggestions */}
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>
                    Suggested queries:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {QUICK_PROMPTS.map((prompt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSend(prompt)}
                        style={{
                          textAlign: 'left',
                          padding: '0.55rem 0.75rem',
                          background: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          color: '#1e3a8a',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#2563eb'
                          e.currentTarget.style.background = '#f0f7ff'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#e2e8f0'
                          e.currentTarget.style.background = 'white'
                        }}
                      >
                        <span>{prompt}</span>
                        <ChevronDown size={14} color="#94a3b8" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message List */}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '100%',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '92%',
                      padding: '0.75rem 0.95rem',
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      background: msg.role === 'user' ? '#1e3a8a' : 'white',
                      color: msg.role === 'user' ? 'white' : '#1e293b',
                      border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      fontSize: '0.85rem',
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.role === 'user' ? (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                    ) : (
                      <div>
                        <MarkdownText content={msg.content} />
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            marginTop: '0.5rem',
                            paddingTop: '0.4rem',
                            borderTop: '1px solid #f1f5f9',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => copyToClipboard(msg.id, msg.content)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: copiedId === msg.id ? '#16a34a' : '#94a3b8',
                              fontSize: '0.7rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check size={12} /> Copied!
                              </>
                            ) : (
                              <>
                                <Copy size={12} /> Copy
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      color: '#94a3b8',
                      marginTop: '0.2rem',
                      padding: '0 0.2rem',
                    }}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              ))}

              {/* Loading Indicator */}
              {isLoading && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px 12px 12px 2px',
                    padding: '0.65rem 0.85rem',
                    width: 'fit-content',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  }}
                >
                  <RotateCw size={14} className="animate-spin" color="#2563eb" />
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Analyzing SBFP dataset & tabs...
                  </span>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    borderRadius: '8px',
                    padding: '0.6rem 0.8rem',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.4rem',
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                  <div style={{ flex: 1 }}>{errorMessage}</div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div
              style={{
                padding: '0.75rem 1rem',
                borderTop: '1px solid #e2e8f0',
                background: 'white',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '0.5rem',
                  background: '#f8fafc',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '0.45rem 0.6rem',
                }}
              >
                <textarea
                  ref={inputRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Ask about ${stats.count} SDOs, active tab (${activeTabLabel}), coops...`}
                  rows={2}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    resize: 'none',
                    fontSize: '0.85rem',
                    fontFamily: 'inherit',
                    color: '#1e293b',
                    maxHeight: 120,
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!inputMessage.trim() || isLoading}
                  style={{
                    background: inputMessage.trim() && !isLoading ? '#1e3a8a' : '#cbd5e1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: inputMessage.trim() && !isLoading ? 'pointer' : 'default',
                    flexShrink: 0,
                    transition: 'background 0.15s ease',
                  }}
                >
                  <Send size={15} />
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '0.4rem',
                  fontSize: '0.7rem',
                  color: '#94a3b8',
                }}
              >
                <span>Shift+Enter for newline</span>
                <span>Model: {selectedModel.split('-')[0] + ' ' + (selectedModel.split('-')[1] || '')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Lightweight Markdown renderer for formatted AI responses.
 */
function MarkdownText({ content }: { content: string }) {
  const renderedElements = useMemo(() => {
    const lines = content.split('\n')
    const elements: React.ReactNode[] = []
    let inTable = false
    let tableRows: string[][] = []

    const flushTable = (key: number) => {
      if (tableRows.length === 0) return null
      const headers = tableRows[0]
      const rows = tableRows.slice(1)

      return (
        <div key={`table-${key}`} style={{ overflowX: 'auto', margin: '0.5rem 0' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.78rem',
              border: '1px solid #e2e8f0',
            }}
          >
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1' }}>
                {headers.map((h, i) => (
                  <th key={i} style={{ padding: '0.35rem 0.5rem', textAlign: 'left', fontWeight: 600 }}>
                    {formatInline(h.trim())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={rIdx} style={{ borderBottom: '1px solid #f1f5f9', background: rIdx % 2 === 1 ? '#f8fafc' : 'white' }}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} style={{ padding: '0.35rem 0.5rem' }}>
                      {formatInline(cell.trim())}
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
          <h4 key={i} style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0.6rem 0 0.25rem 0', color: '#0f172a' }}>
            {formatInline(line.replace('### ', ''))}
          </h4>
        )
      } else if (line.startsWith('## ')) {
        elements.push(
          <h3 key={i} style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0.75rem 0 0.3rem 0', color: '#0f172a' }}>
            {formatInline(line.replace('## ', ''))}
          </h3>
        )
      } else if (line.startsWith('# ')) {
        elements.push(
          <h2 key={i} style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0.85rem 0 0.35rem 0', color: '#0f172a' }}>
            {formatInline(line.replace('# ', ''))}
          </h2>
        )
      }
      // Bullet list items
      else if (/^[-*]\s/.test(line.trim())) {
        elements.push(
          <div key={i} style={{ display: 'flex', gap: '0.4rem', margin: '0.2rem 0', paddingLeft: '0.4rem' }}>
            <span style={{ color: '#2563eb', fontWeight: 700 }}>•</span>
            <span>{formatInline(line.trim().replace(/^[-*]\s/, ''))}</span>
          </div>
        )
      }
      // Numbered list items
      else if (/^\d+\.\s/.test(line.trim())) {
        const num = line.trim().match(/^(\d+)\.\s/)?.[1]
        elements.push(
          <div key={i} style={{ display: 'flex', gap: '0.4rem', margin: '0.2rem 0', paddingLeft: '0.4rem' }}>
            <span style={{ color: '#2563eb', fontWeight: 600, minWidth: '1.1rem' }}>{num}.</span>
            <span>{formatInline(line.trim().replace(/^\d+\.\s/, ''))}</span>
          </div>
        )
      }
      // Empty lines
      else if (!line.trim()) {
        elements.push(<div key={i} style={{ height: '0.4rem' }} />)
      }
      // Regular paragraph
      else {
        elements.push(
          <p key={i} style={{ margin: '0.25rem 0', lineHeight: 1.5 }}>
            {formatInline(line)}
          </p>
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
        </strong>
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
        </code>
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
