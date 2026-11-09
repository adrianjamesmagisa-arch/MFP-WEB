'use client'

import { Download } from 'lucide-react'
import { cooperativePaymentsCsv, type CooperativePayments } from '@/lib/cooperative-payments'
import styles from './CooperativePaymentSummary.module.css'

const peso = (value: number | null) => value == null ? 'N/A' : `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`

export function CooperativePaymentSummary({ summary, year }: { summary: CooperativePayments; year: string }) {
  function download() {
    const blob = new Blob([cooperativePaymentsCsv(summary)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `sbfp_cooperative_payments_${year}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }
  return (
    <section className={styles.section} aria-labelledby="cooperative-payment-title">
      <div className={styles.heading}>
        <div><h3 id="cooperative-payment-title">Cooperatives that received payment</h3><p>One count per cooperative across the contracts matching the current report filters.</p></div>
        <button className="btn btn-outline no-print" type="button" onClick={download} disabled={!summary.rows.length}><Download size={15} aria-hidden="true" /> Payment summary .CSV</button>
      </div>
      <div className={styles.cards}>
        <div><span>Received payment</span><strong>{summary.paidCount}</strong></div>
        <div><span>Fully paid</span><strong>{summary.fullyPaidCount}</strong></div>
        <div><span>Partially paid</span><strong>{summary.partiallyPaidCount}</strong></div>
        {summary.unknownContractCount > 0 && <div><span>Contract amount missing</span><strong>{summary.unknownContractCount}</strong></div>}
        <div><span>Total recorded payments</span><strong>{peso(summary.totalPaid)}</strong></div>
      </div>
      <p className={styles.note}>Received payment means a positive net amount in the encoded payment entries. Fully paid means every selected contract is settled. Delivery filters select contracts; payment amounts include all recorded payment dates.</p>
      {summary.unassignedCount > 0 && <p role="status" className={styles.warning}>{summary.unassignedCount} contract(s) with recorded payments totaling {peso(summary.unassignedPaid)} have no assigned cooperative. They are included in total recorded payments, but excluded from the cooperative count and list.</p>}
      <div className={styles.scroll} role="region" aria-label="Cooperative payments table" tabIndex={0}>
        <table className={styles.table}>
          <thead><tr><th scope="col">Cooperative / contracts</th><th scope="col">Center(s)</th><th scope="col">SDOs</th><th scope="col">Contracted amount</th><th scope="col">Amount paid</th><th scope="col">Remaining to pay</th><th scope="col">Payment status</th></tr></thead>
          <tbody>{summary.rows.length === 0 ? <tr><td colSpan={7} className={styles.empty}>No cooperatives with recorded payments in the current selection.</td></tr> : summary.rows.map(row => (
            <tr key={row.id}>
              <td><strong>{row.name}</strong><details><summary>{row.contracts.length} contract(s)</summary><ul>{row.contracts.map(contract => <li key={contract.id}><strong>{contract.sdo}</strong> · {contract.center}<br />Paid: {peso(contract.paid)} · Balance: {peso(contract.balance)}</li>)}</ul></details></td>
              <td>{row.centers.join(', ')}</td><td className={styles.number}>{row.sdoCount}</td><td className={styles.number}>{peso(row.contractAmount)}</td><td className={`${styles.number} ${styles.paid}`}>{peso(row.paid)}</td><td className={styles.number}>{peso(row.balance)}</td><td><span className={row.status === 'Fully paid' ? styles.full : styles.partial}>{row.status}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  )
}
