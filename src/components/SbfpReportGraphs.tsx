'use client'

import { useState, type ReactNode } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { graphFormat, type ReportGraph, type ReportGraphRow } from '@/lib/sbfp-report-graphs'
import styles from './SbfpReportGraphs.module.css'

export function SbfpGraphModeToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={enabled} aria-label="Graph mode for SBFP tabs 1 to 8" className="btn btn-outline no-print"
    onClick={() => onChange(!enabled)}><span aria-hidden="true">▥</span> Graph mode: {enabled ? 'ON' : 'OFF'}</button>
}

function Timeline({ rows }: { rows: ReportGraphRow[] }) {
  const valid = rows.filter(row => row.start && row.end && Number.isFinite(Date.parse(row.start)) && Number.isFinite(Date.parse(row.end)) && row.start <= row.end)
  const start = Math.min(...valid.map(row => Date.parse(row.start!)))
  const end = Math.max(...valid.map(row => Date.parse(row.end!)))
  const span = Math.max(86400000, end - start)
  return <>
    {valid.length > 0 && <div className={styles.timeline}>
      <div className={styles.timelineDates}><span>{new Date(start).toISOString().slice(0, 10)}</span><span>{new Date(end).toISOString().slice(0, 10)}</span></div>
      {valid.map(row => <div key={row.id} className={styles.timelineRow}><span>{row.label}</span><div className={styles.track}>
        <span role="img" aria-label={`${row.label}: ${row.start} through ${row.end}; ${row.status}`} title={`${row.start} through ${row.end} · ${row.status}`}
          className={styles.schedule} style={{ left: `${(Date.parse(row.start!) - start) / span * 100}%`, width: `${Math.max(1, (Date.parse(row.end!) - Date.parse(row.start!)) / span * 100)}%`, background: statusColor(row.status) }} />
      </div><small>{row.start} – {row.end}<br />{row.status}</small></div>)}
    </div>}
    {rows.length > valid.length && <p role="status">Schedule unavailable or invalid for {rows.length - valid.length} contract(s): {rows.filter(row => !valid.includes(row)).map(row => row.label).join('; ')}.</p>}
    <p>Saved schedules only; bar colors show procurement status. Completed: green; awarded: blue; ongoing: amber; preparation: gray; failed: red.</p>
  </>
}
function statusColor(status?: string) {
  return status === 'Completed' ? '#15803d' : status === 'Failed' ? '#be123c' : status?.startsWith('Awarded') ? '#2563eb' : status?.startsWith('Ongoing') ? '#d97706' : '#64748b'
}

function GraphCard({ graph, rows }: { graph: ReportGraph; rows: ReportGraphRow[] }) {
  const data = rows.map(row => ({ ...row.values, id: row.id, label: row.label }))
  const chartHeight = graph.kind === 'line' || graph.kind === 'columns' ? 330 : Math.max(200, rows.length * Math.max(42, graph.stacked ? 42 : graph.series.length * 18) + 70)
  const visibleSeries = graph.series.filter(series => graph.kind === 'line' || rows.some(row => row.values[series.key] != null && row.values[series.key] !== 0) || graph.series.length === 1)
  // Keep zero-valued primary series when the entire result is explicitly zero.
  const series = visibleSeries.length ? visibleSeries : graph.series.slice(0, 2)
  const tooltip = ({ label, payload }: { label?: ReactNode; payload?: ReadonlyArray<{ payload?: { id?: string } }> }) => {
    const row = rows.find(row => row.id === payload?.[0]?.payload?.id) || rows.find(row => row.label === label)
    return row ? <div className={styles.tooltip}><strong>{row.label}</strong>{graph.series.map(series => <div key={series.key}>{series.label}: {graphFormat(row.values[series.key], graph.unit)}</div>)}
      {Object.entries(row.details || {}).map(([key, value]) => <div key={key}>{key}: {value}</div>)}</div> : null
  }
  return <section className={styles.card} aria-label={graph.title}>
    <h3>{graph.title}</h3><p className={styles.unit}>Unit: {graph.unit} · {rows.length} {graph.kind === 'line' ? 'month(s)' : 'row(s)'}</p>
    {rows.length === 1 && graph.kind !== 'timeline' && <p className={styles.note}>{Object.entries(rows[0].details || {}).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p>}
    {rows.length > 0 && graph.kind !== 'timeline' && !rows.some(row => Object.values(row.values).some(value => value != null)) && <p role="status">No known values for this comparison. Missing figures remain unavailable.</p>}
    {!rows.length ? <p role="status">No records match this selection.</p> : graph.kind === 'timeline' ? <Timeline rows={rows} /> : <>
      <div className={styles.legend}>{series.map(item => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
      <div className={styles.chartScroll}><div style={{ height: chartHeight, minWidth: 520 }}>
        <ResponsiveContainer width="100%" height="100%">
          {graph.kind === 'line' ? <LineChart data={data} margin={{ top: 18, right: 25, bottom: 20, left: 20 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis domain={[0, 'auto']} tickFormatter={value => compact(Number(value))} /><Tooltip content={tooltip} />
            {series.map(item => <Line key={item.key} dataKey={item.key} name={item.label} stroke={item.color} connectNulls={false} isAnimationActive={false} strokeWidth={2.5} dot={{ r: 4 }} />)}
          </LineChart> : <BarChart data={data} layout={graph.kind === 'columns' ? 'horizontal' : 'vertical'} stackOffset="sign" margin={{ top: 12, right: 70, bottom: 15, left: 8 }} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" />
            {graph.kind === 'columns' ? <><XAxis type="category" dataKey="label" /><YAxis type="number" domain={[0, 'auto']} width={85} tickFormatter={value => `${graph.unit === 'PHP' ? '₱' : ''}${compact(Number(value))}`} /></> : <>
              <XAxis type="number" domain={[Math.min(0, ...rows.flatMap(row => Object.values(row.values).filter((value): value is number => value != null))), graph.unit === '%' ? (maximum: number) => Math.max(100, maximum) : 'auto']} tickFormatter={value => `${graph.unit === 'PHP' ? '₱' : ''}${compact(Number(value))}${graph.unit === '%' ? '%' : ''}`} />
              <YAxis type="category" dataKey="label" width={190} tick={{ fontSize: 11 }} interval={0} tickFormatter={value => String(value).length > 30 ? `${String(value).slice(0, 29)}…` : String(value)} />
            </>}
            <Tooltip content={tooltip} />{graph.reference != null && <ReferenceLine x={graph.reference} stroke="#475569" strokeDasharray="4 4" label={`${graph.reference}% target`} />}
            {series.map(item => <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} stackId={graph.stacked ? 'progress' : undefined} isAnimationActive={false} maxBarSize={25} />)}
          </BarChart>}
        </ResponsiveContainer>
      </div></div>
      <details className={styles.exact}><summary>Exact chart values ({graph.unit})</summary><ul>{rows.map(row => <li key={row.id}><strong>{row.label}</strong>: {graph.series.map(item => `${item.label}: ${graphFormat(row.values[item.key], graph.unit)}`).join(' · ')}{Object.entries(row.details || {}).map(([key, value]) => ` · ${key}: ${value}`).join('')}</li>)}</ul></details>
    </>}
    {graph.note && <p className={styles.note}>{graph.note}</p>}
  </section>
}
const compact = (value: number) => value.toLocaleString('en-PH', { notation: 'compact', maximumFractionDigits: 1 })

/** One graph-mode layout for every supported tab; shared controls keep paired contracts aligned. */
export function SbfpReportGraphView({ enabled, graphs, scope, children, controls }: {
  enabled: boolean; graphs: ReportGraph[]; scope: string; children: ReactNode; controls?: ReactNode
}) {
  const [showData, setShowData] = useState(false)
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState('20')
  const [sort, setSort] = useState('default')
  if (!enabled) return <>{children}</>
  const filterable = graphs.some(graph => graph.filterable)
  function selectedRows(graph: ReportGraph) {
    if (!graph.filterable) return graph.rows
    const matching = graph.rows.filter(row => row.label.toLowerCase().includes(search.toLowerCase()))
    if (sort !== 'default') matching.sort((a, b) => (b.sort?.[sort] ?? -Infinity) - (a.sort?.[sort] ?? -Infinity) || a.label.localeCompare(b.label))
    return limit === 'ALL' ? matching : matching.slice(0, Number(limit))
  }
  return <div className={styles.report}>
    <p className={styles.scope}>{scope}</p>
    <div className={`${styles.controls} no-print`}>{controls}
      {filterable && <><label>Find cooperative / contract<input value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>Show<select value={limit} onChange={event => setLimit(event.target.value)}><option value="10">Top 10</option><option value="20">Top 20</option><option value="ALL">All</option></select></label>
        <label>Sort<select value={sort} onChange={event => setSort(event.target.value)}><option value="default">Report order</option><option value="contract">Largest contract / target</option><option value="paid">Largest payment / delivery</option><option value="balance">Largest balance</option></select></label></>}
      <button type="button" className="btn btn-outline" aria-expanded={showData} onClick={() => setShowData(value => !value)}>{showData ? 'Hide underlying data' : 'View underlying data'}</button>
    </div>
    <div className={styles.grid}>{graphs.map((graph, index) => {
      const rows = selectedRows(graph)
      return <div key={index}>{graph.filterable && <p className={styles.scope}>Showing {rows.length} of {graph.rows.length} rows. Visible bars are a subset; summary cards retain the full report totals. Sort: {sort}; search: {search || 'none'}.</p>}<GraphCard graph={graph} rows={rows} /></div>
    })}</div>
    {showData && <div className="no-print">{children}</div>}
  </div>
}
