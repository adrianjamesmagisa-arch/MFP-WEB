'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import type { MfpListRow } from '@/lib/mfp-sbfp-source'
import { summarizeMfpRows } from '@/lib/mfp-analytics'
import { useMfpAnalysisScope } from '@/components/MfpAnalysisScope'
import { MfpAnalysisColumnSelection } from '@/components/MfpAnalysisColumns'
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
} from 'lucide-react'

export interface MfpAiAgentProps {
  records: MfpListRow[]
  centerLabel?: string | null
  yearLabel?: string | number | null
  activeFilters?: Record<string, string | number | undefined>
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  basis?: string
  origin?: 'computed' | 'groq'
}

const DEFAULT_MODEL = 'openai/gpt-oss-120b'
const GROQ_MODELS = [
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (High Intelligence · Recommended)' },
  { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B (Fast & Accurate)' },
  { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B (Compact)' },
]

const QUICK_PROMPTS = [
  'How many elementary schools are participating in this scope?',
  'Summarize the key metrics of the current filtered data',
  'Total milk packs delivered vs target & completion rate',
  'Break down milk packs and funds by Center and Region',
  'Top cooperatives by milk packs',
  'Compare funding sources (DepEd vs DSWD vs LDS)',
  'Show zero or delayed deliveries',
]

export function MfpAiAgent(props: MfpAiAgentProps) {
  const analysis = useMfpAnalysisScope()
  const [isOpen, setIsOpen] = useState(false)
  const records = analysis?.mode === 'selected' ? props.records.filter(row => analysis.selectedIds.has(row.id)) : props.records
  const scopeKey = analysis ? `${analysis.version}:${analysis.mode}:${[...analysis.selectedIds].sort().join('|')}:${[...analysis.selectedColumns].sort().join('|')}` : 'unavailable'
  return <MfpAiConversation key={scopeKey} {...props} records={records} analysis={analysis} isOpen={isOpen} setIsOpen={setIsOpen} />
}

function MfpAiConversation({ records, analysis, isOpen, setIsOpen }: MfpAiAgentProps & {
  analysis: ReturnType<typeof useMfpAnalysisScope>; isOpen: boolean; setIsOpen: (open: boolean) => void
}) {
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
  const requestRef = useRef<AbortController | null>(null)
  const inFlight = useRef(false)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [retryUntil, setRetryUntil] = useState(0)
  const [clock, setClock] = useState(0)
  const retrySeconds = Math.max(0, Math.ceil((retryUntil - clock) / 1000))
  useEffect(() => () => requestRef.current?.abort(), [])
  useEffect(() => {
    if (!retryUntil) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [retryUntil])
  const closeAssistant = () => { requestRef.current?.abort(); setIsOpen(false) }

  // Load saved API key and model from localStorage on mount
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

  const overview = useMemo(() => summarizeMfpRows(records), [records])

  // Counts and totals are computed by the authorized server; explanations use bounded facts.
  const handleSend = async (textToSend?: string, action: 'question' | 'columns' = 'question') => {
    const prompt = (textToSend || inputMessage).trim()
    if (!prompt || inFlight.current) return
    if (!analysis) { setErrorMessage('Refresh MFP Data before analyzing its records.'); return }
    if (!analysis.selectedColumns.size) { setErrorMessage('Choose analysis columns in the table headers or use All supported columns.'); return }
    if (!records.length) { setErrorMessage('No records are in this scope.'); return }
    if (new TextEncoder().encode(prompt).byteLength > 2000) { setErrorMessage('Please keep the question under 2,000 UTF-8 bytes.'); return }
    if (action === 'question' && /\b(selected|checked)\s+(rows?|records?|schools?)\b/i.test(prompt) && analysis.mode !== 'selected') {
      setErrorMessage('Use the Analyze checkboxes and choose Selected records before asking about selected rows.'); return
    }
    if (/\b(all filtered|filtered rows|filtered records)\b/i.test(prompt) && analysis.mode !== 'filtered') {
      setErrorMessage('Choose All filtered records to ask about the full filtered table.'); return
    }
    setErrorMessage(null); setNeedsRefresh(false)
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: prompt, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
    const next = [...messages, userMsg]
    setMessages(next); setInputMessage(''); setIsLoading(true); inFlight.current = true
    const controller = new AbortController()
    requestRef.current = controller
    const timer = setTimeout(() => controller.abort(), 45000)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey.trim()) headers['x-groq-api-key'] = apiKey.trim()
      const res = await fetch('/api/ai/mfp', { method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({ messages: next.slice(-8).map(message => ({ role: message.role,
          content: message.role === 'assistant' && message.content.length > 5000
            ? message.content.slice(0, 5000) + '\n[Earlier response abbreviated. Use the current verified facts for calculations.]' : message.content })), model: selectedModel,
          filters: analysis.filters, version: analysis.version, scope: analysis.mode, selectedIds: analysis.mode === 'selected' ? [...analysis.selectedIds] : [],
          columns: [...analysis.selectedColumns], action }),
      })
      const data = await res.json()
      if (controller.signal.aborted) return
      if (!res.ok) {
        if (data.requiresKey) setShowSettings(true)
        if (data.stale) setNeedsRefresh(true)
        if (typeof data.retryAfter === 'number') { const now = Date.now(); setClock(now); setRetryUntil(now + data.retryAfter * 1000) }
        throw new Error(typeof data.error === 'string' ? data.error : 'Analysis could not be completed.')
      }
      if (typeof data.content !== 'string') throw new Error('The analysis response was invalid.')
      setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'assistant', content: data.content,
        basis: data.basis, origin: data.origin, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    } catch (error) {
      setErrorMessage(controller.signal.aborted ? 'Analysis cancelled or timed out. You can retry the question.' : error instanceof Error ? error.message : 'Analysis could not be completed.')
    } finally {
      clearTimeout(timer); if (requestRef.current === controller) requestRef.current = null
      inFlight.current = false; setIsLoading(false)
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
    if (inFlight.current) return
    if (confirm('Clear chat conversation?')) {
      setMessages([])
      setErrorMessage(null)
    }
  }

  return (
    <>
      {/* 1. Header Trigger Button (Placed beside Export as .CSV) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="btn"
        style={{
          background: 'linear-gradient(135deg, #0a1628 0%, #1e3a6e 50%, #2563eb 100%)',
          color: 'white',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          padding: '0.55rem 1rem',
          borderRadius: '8px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        title="Ask AI questions about the filtered table data"
      >
        <Sparkles size={16} color="#fbbf24" style={{ filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.6))' }} />
        <span>AI Agent</span>
        <span
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            color: '#fef3c7',
            fontSize: '0.7rem',
            padding: '0.1rem 0.45rem',
            borderRadius: '999px',
            marginLeft: '0.15rem',
            fontWeight: 700,
          }}
        >
          {records.length}
        </span>
      </button>

      {/* 2. Slide-over Copilot Drawer */}
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70 }}>
          {/* Subtle backdrop overlay */}
          <div
            onClick={closeAssistant}
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
              width: 480,
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
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'white' }}>MFP AI Agent</h2>
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
                    {records.length.toLocaleString()} {analysis?.mode === 'selected' ? 'selected' : 'filtered'} records
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
                    disabled={isLoading}
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
                  onClick={closeAssistant}
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

            <div className="border-b bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <label className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">Analyze
                <select aria-label="Analysis scope" className="rounded border bg-white px-2 py-2" value={analysis?.mode || 'filtered'}
                  onChange={event => analysis?.setMode(event.target.value === 'selected' ? 'selected' : 'filtered')}>
                  <option value="filtered">All filtered records</option>
                  <option value="selected" disabled={!analysis?.selectedIds.size}>Selected records ({analysis?.selectedIds.size || 0})</option>
                </select>
              </label>
              <p className="mt-2">{records.length.toLocaleString()} rows{analysis?.selectedColumns.has('center') ? ` · ${overview.centers.length} center(s)` : ''}{analysis?.selectedColumns.has('elementary_school') ? ` · ${overview.schools.count.toLocaleString()} identified ${overview.schools.unit}` : ''}</p>
              <MfpAnalysisColumnSelection />
              <button type="button" className="btn btn-primary" style={{ marginTop: 8, fontSize: '0.75rem' }}
                disabled={isLoading || !records.length || !analysis?.selectedColumns.size}
                onClick={() => void handleSend('Analyze selected columns', 'columns')}>Analyze selected columns</button>
              <p className="mt-1">Choose rows in the school column and columns in the table headers. Changing rows, columns, or filters starts a new conversation. Selecting columns does not send a request.</p>
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
                <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
                        background: 'linear-gradient(135deg, #0a1628 0%, #2563eb 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 0.75rem auto',
                      }}
                    >
                      <Bot size={24} color="white" />
                    </div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--navy)', margin: '0 0 0.25rem 0' }}>
                      Ask about this data scope
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                      Exact counts, totals and supported breakdowns use system calculations. Groq provides explanations from verified aggregates.
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
                          color: '#1e293b',
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
                      background: msg.role === 'user' ? 'var(--navy)' : 'white',
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
                        <div className="mb-2 text-[0.65rem] font-semibold text-blue-800">{msg.origin === 'computed' ? 'System calculation' : 'AI explanation'}</div>
                        <MarkdownText content={msg.content} />
                        {msg.basis && <p className="mt-3 border-t pt-2 text-[0.65rem] text-slate-500">{msg.basis}</p>}
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
                              padding: 0,
                            }}
                          >
                            {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                            {copiedId === msg.id ? 'Copied' : 'Copy'}
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
                      paddingLeft: '0.25rem',
                      paddingRight: '0.25rem',
                    }}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              ))}

              {/* Loading Indicator */}
              {isLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
                  <div
                    style={{
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px 12px 12px 2px',
                      padding: '0.6rem 0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.8rem',
                      color: '#64748b',
                    }}
                  >
                    <RotateCw size={14} className="animate-spin" color="#2563eb" />
                    <span>Verifying records and calculating the answer...</span><button type="button" className="underline" onClick={() => requestRef.current?.abort()}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Error banner */}
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
                  <div style={{ flex: 1 }} role="alert">{errorMessage}
                    {needsRefresh ? <button type="button" className="mt-2 block underline" onClick={() => window.location.reload()}>Refresh table</button>
                      : <button type="button" className="mt-2 block underline disabled:opacity-50" disabled={isLoading || retrySeconds > 0}
                        onClick={() => handleSend([...messages].reverse().find(message => message.role === 'user')?.content)}>
                        {retrySeconds ? `Retry explanation in ${retrySeconds}s` : 'Retry last question'}
                      </button>}
                  </div>
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
                  placeholder={`Ask about ${records.length} ${analysis?.mode === 'selected' ? 'selected' : 'filtered'} records...`}
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
                  aria-label="Send analysis question"
                  onClick={() => handleSend()}
                  disabled={!inputMessage.trim() || isLoading}
                  style={{
                    background: inputMessage.trim() && !isLoading ? 'var(--navy)' : '#cbd5e1',
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
                <span>Model: {selectedModel.split('-')[0] + ' ' + selectedModel.split('-')[1]}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Lightweight, zero-dependency Markdown renderer for formatted AI responses.
 * Supports headers, tables, bold, italics, bullet lists, numbered lists, and code blocks.
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
          <h4 key={i} style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0.6rem 0 0.25rem 0', color: 'var(--navy)' }}>
            {formatInline(line.replace('### ', ''))}
          </h4>
        )
      } else if (line.startsWith('## ')) {
        elements.push(
          <h3 key={i} style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0.75rem 0 0.3rem 0', color: 'var(--navy)' }}>
            {formatInline(line.replace('## ', ''))}
          </h3>
        )
      } else if (line.startsWith('# ')) {
        elements.push(
          <h2 key={i} style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0.85rem 0 0.35rem 0', color: 'var(--navy)' }}>
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
  // Split on bold or code segments
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
