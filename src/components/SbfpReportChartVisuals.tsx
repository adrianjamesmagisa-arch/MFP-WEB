'use client'

import { graphFormat, type ReportGraph, type ReportGraphRow } from '@/lib/sbfp-report-graphs'
import styles from './SbfpReportGraphs.module.css'

type Props = { graph: ReportGraph; rows: ReportGraphRow[] }
const exact = (graph: ReportGraph, row: ReportGraphRow) => `${row.label}: ${graph.series.map(item => `${item.label}: ${graphFormat(row.values[item.key], graph.unit)}`).join('; ')}`

function Donut({ graph, rows }: Props) {
  const total = rows.reduce((sum, row) => sum + (row.values.value ?? 0), 0)
  if (!(total > 0) || rows.some(row => row.values.value == null || row.values.value < 0)) return <p role="status">A doughnut requires a positive total and known, nonnegative slices. See exact values.</p>
  const circumference = 2 * Math.PI * 76
  return <>
    <svg className={styles.donut} viewBox="0 0 320 230" role="img" aria-label={`${graph.title}; total ${graphFormat(total, graph.unit)}`}>
      <circle cx="160" cy="110" r="76" fill="none" stroke="#f1f5f9" strokeWidth="30" />
      {rows.map((row, index) => {
        const value = row.values.value!
        const offset = rows.slice(0, index).reduce((sum, previous) => sum + previous.values.value!, 0) / total * circumference
        return value > 0 && <circle key={row.id} cx="160" cy="110" r="76" fill="none" stroke={row.color || graph.series[0].color} strokeWidth="30"
          strokeDasharray={`${value / total * circumference} ${circumference}`} strokeDashoffset={-offset} transform="rotate(-90 160 110)" tabIndex={0} role="img"
          aria-label={`${row.label}: ${graphFormat(value, graph.unit)}; ${(value / total * 100).toFixed(1)}%`}>
          <title>{`${row.label}: ${graphFormat(value, graph.unit)} (${(value / total * 100).toFixed(1)}%)`}</title>
        </circle>
      })}
      <text x="160" y="108" textAnchor="middle" className={styles.donutValue} fontSize={graph.center && graph.center.value.length > 15 ? 13 : 18}>{graph.center?.value || graphFormat(total, graph.unit)}</text>
      <text x="160" y="130" textAnchor="middle" fontSize="11" fill="#475569">{graph.center?.label || 'Total'}</text>
    </svg>
    <ul className={styles.sliceLegend}>{rows.map(row => <li key={row.id}><i style={{ background: row.color }} /><span>{row.label}</span><strong>{graphFormat(row.values.value, graph.unit)}</strong><span>{((row.values.value ?? 0) / total * 100).toFixed(1)}%</span></li>)}</ul>
  </>
}

function Waffle({ graph, rows }: Props) {
  const total = rows.reduce((sum, row) => sum + (row.values.value ?? 0), 0)
  const valid = rows.every(row => row.values.value != null && Number.isInteger(row.values.value) && row.values.value >= 0)
  return <>
    <p><strong>{total.toLocaleString('en-PH')}</strong> unique SDOs · one square = one SDO</p>
    {!valid || total > 2000 ? <p role="status">{!valid ? 'Unknown or noninteger counts cannot form a one-SDO grid.' : 'The grid is too large to display individually. Exact status counts are listed below.'}</p> :
      <div className={styles.waffle} role="img" aria-label={`${total} unique SDOs. ${rows.map(row => `${row.label}: ${row.values.value}`).join('; ')}`}>
        {rows.flatMap(row => Array.from({ length: row.values.value! }, (_, index) => <span key={`${row.id}-${index}`} style={{ background: row.color }} title={`${row.label} — one SDO`} aria-hidden="true" />))}
      </div>}
    <ul className={styles.sliceLegend}>{rows.map(row => <li key={row.id}><i style={{ background: row.color }} /><span>{row.label}</span><strong>{graphFormat(row.values.value, graph.unit)}</strong></li>)}</ul>
  </>
}

function Heatmap({ graph, rows }: Props) {
  function cell(value: number | null) {
    if (value == null) return { background: '#f1f5f9', color: '#475569' }
    if (value < 0 || value > 100) return { background: '#fef3c7', color: '#78350f', border: '2px solid #b45309' }
    return value >= 75 ? { background: '#1e40af', color: 'white' } : value >= 50 ? { background: '#93c5fd', color: '#172554' } : value >= 25 ? { background: '#dbeafe', color: '#172554' } : { background: '#eff6ff', color: '#172554' }
  }
  return <>
    <p className={styles.note}>Common scale: 0–&lt;25%, 25–&lt;50%, 50–&lt;75%, 75–100% (light to dark blue). Amber outlines mark values outside 0–100%; gray means unavailable.</p>
    <div className={styles.chartScroll}><table className={styles.heatmap} aria-label={graph.title}><thead><tr><th scope="col">Region / contract</th>{graph.series.map(item => <th key={item.key} scope="col">{item.label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}><th scope="row">{row.label}</th>{graph.series.map(item => <td key={item.key} style={cell(row.values[item.key])}>{graphFormat(row.values[item.key], graph.unit)}</td>)}</tr>)}</tbody>
    </table></div>
  </>
}

/** All rows share the same numeric axis; endpoints never normalize each row separately. */
function DotComparison({ graph, rows }: Props) {
  const values = rows.flatMap(row => graph.series.flatMap(item => row.values[item.key] == null ? [] : [row.values[item.key]!]))
  const minimum = Math.min(0, ...values)
  const maximum = Math.max(1, graph.reference ?? 0, ...values)
  const x = (value: number) => 14 + (value - minimum) / (maximum - minimum) * 272
  return <>
    <div className={styles.legend}>{graph.series.map(item => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
    {graph.reference != null && <p className={styles.note}>Dashed reference: {graphFormat(graph.reference, graph.unit)}.</p>}
    <div className={styles.dotRows}>{rows.map(row => {
      const first = row.values[graph.series[0].key]
      const second = graph.series[1] ? row.values[graph.series[1].key] : null
      return <div className={styles.dotRow} key={row.id}><strong>{row.label}</strong><div>
        <svg viewBox="0 0 300 34" role="img" aria-label={exact(graph, row)}>
          <line x1="14" x2="286" y1="17" y2="17" stroke="#e2e8f0" />
          <line x1={x(0)} x2={x(0)} y1="3" y2="31" stroke="#94a3b8" />
          {graph.reference != null && <line x1={x(graph.reference)} x2={x(graph.reference)} y1="0" y2="34" stroke="#475569" strokeDasharray="3 3" />}
          {graph.kind === 'dumbbell' && first != null && second != null && <line x1={x(first)} x2={x(second)} y1="17" y2="17" stroke="#94a3b8" strokeWidth="3" />}
          {graph.kind === 'lollipop' && first != null && <line x1={x(0)} x2={x(first)} y1="17" y2="17" stroke={row.color || graph.series[0].color} strokeWidth="2" />}
          {graph.series.map((item, index) => row.values[item.key] != null && <circle key={item.key} cx={x(row.values[item.key]!)} cy="17" r={index === 0 && graph.kind === 'dumbbell' ? 6 : 4}
            fill={index === 0 && graph.kind === 'dumbbell' ? 'white' : row.color || item.color} stroke={row.color || item.color} strokeWidth="2" tabIndex={0} role="img" aria-label={`${row.label}; ${item.label}: ${graphFormat(row.values[item.key], graph.unit)}`}><title>{exact(graph, row)}</title></circle>)}
        </svg>
        <small>{graph.series.map(item => `${item.label}: ${graphFormat(row.values[item.key], graph.unit)}`).join(' · ')}</small>
      </div></div>
    })}</div>
    <div className={styles.numericAxis}><span>{graphFormat(minimum, graph.unit)}</span><span>{graphFormat(maximum, graph.unit)}</span></div>
  </>
}

function Scatter({ graph, rows }: Props) {
  const [horizontal, vertical] = graph.series
  const valid = rows.filter(row => row.values[horizontal.key] != null && row.values[vertical.key] != null)
  const domain = (key: string) => [Math.min(0, ...valid.map(row => row.values[key]!)), Math.max(100, ...valid.map(row => row.values[key]!))]
  const [xMin, xMax] = domain(horizontal.key), [yMin, yMax] = domain(vertical.key)
  const x = (value: number) => 68 + (value - xMin) / (xMax - xMin) * 530
  const y = (value: number) => 310 - (value - yMin) / (yMax - yMin) * 280
  return <>
    <svg className={styles.scatter} viewBox="0 0 660 375" role="img" aria-label={`${graph.title}. X: ${horizontal.label}; Y: ${vertical.label}`}>
      {[...new Set([xMin, 0, 100, xMax])].map(value => <g key={`x-${value}`}><line x1={x(value)} x2={x(value)} y1="30" y2="310" stroke={value === 100 ? '#64748b' : '#e2e8f0'} strokeDasharray={value === 100 ? '4 4' : undefined} /><text x={x(value)} y="330" textAnchor="middle" fontSize="11">{value.toFixed(1)}%</text></g>)}
      {[...new Set([yMin, 0, 100, yMax])].map(value => <g key={`y-${value}`}><line x1="68" x2="598" y1={y(value)} y2={y(value)} stroke={value === 100 ? '#64748b' : '#e2e8f0'} strokeDasharray={value === 100 ? '4 4' : undefined} /><text x="58" y={y(value) + 4} textAnchor="end" fontSize="11">{value.toFixed(1)}%</text></g>)}
      <text x="330" y="365" textAnchor="middle" fontSize="12">{horizontal.label} (%)</text>
      <text transform="translate(15 170) rotate(-90)" textAnchor="middle" fontSize="12">{vertical.label} (%)</text>
      {valid.map((row, index) => <g key={row.id} tabIndex={0} role="img" aria-label={exact(graph, row)}><title>{exact(graph, row)}</title>
        <circle cx={x(row.values[horizontal.key]!)} cy={y(row.values[vertical.key]!)} r="6" fill="#2563eb" fillOpacity="0.65" stroke="#1e3a8a" />
        <text x={x(row.values[horizontal.key]!) + 8} y={y(row.values[vertical.key]!) - 8} fontSize="10">{index + 1}</text>
      </g>)}
    </svg>
    <p className={styles.note}>Dashed lines mark 100%. Points identify centers, not a time trend. Overlapping points retain separate keyboard focus and exact values.</p>
    <ol className={styles.pointLegend}>{valid.map(row => <li key={row.id}>{row.label}</li>)}</ol>
    {valid.length < rows.length && <p role="status">{rows.length - valid.length} center(s) lack one or both rates and are excluded from the plot: {rows.filter(row => !valid.includes(row)).map(row => row.label).join(', ')}. Their values remain below.</p>}
  </>
}

export function SbfpReportChartVisual(props: Props) {
  switch (props.graph.kind) {
    case 'donut': return <Donut {...props} />
    case 'waffle': return <Waffle {...props} />
    case 'heatmap': return <Heatmap {...props} />
    case 'scatter': return <Scatter {...props} />
    default: return <DotComparison {...props} />
  }
}
