'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Printer, Filter } from 'lucide-react'

export default function SbfpNarrativeReport() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().split('T')[0])
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [year, setYear] = useState('2026')
  const supabase = createClient()

  useEffect(() => {
    setLoading(true)
    supabase.from('sbfp_data').select('*')
      .eq('year', parseInt(year))
      .order('region', { ascending: true })
      .order('sdo', { ascending: true })
      .then(({ data }) => { setRecords(data || []); setLoading(false) })
  }, [year])

  // Filter records by delivery date range
  const filteredRecords = useMemo(() => {
    if (!filterStartDate && !filterEndDate) return records
    return records.filter(r => {
      const start = r.delivery_start
      const end = r.delivery_end
      if (filterStartDate && end && end < filterStartDate) return false
      if (filterEndDate && start && start > filterEndDate) return false
      return true
    })
  }, [records, filterStartDate, filterEndDate])

  // Find best snapshot date from selected reportDate
  const getBestSnapshotPacks = (r: any): number => {
    const snaps: Array<{ date: string; packs: number }> = r.delivery_snapshots || []
    if (snaps.length === 0) return r.packs_delivered || 0
    // Find snapshot closest to (but not after) reportDate
    const best = snaps
      .filter(s => s.date <= reportDate)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    return best?.packs || 0
  }

  const stats = useMemo(() => {
    const uniqueSDOs = new Set(filteredRecords.map(r => r.sdo))
    const prepSDOs = new Set<string>()
    const ongoingSDOs = new Set<string>()
    const awardedForDelivery = new Set<string>()
    const awardedOngoing = new Set<string>()
    const completedSDOs = new Set<string>()
    let totalDelivered = 0

    filteredRecords.forEach(r => {
      const s = (r.procurement_status || '').toUpperCase()
      if (s === 'FOR PREPARATION') prepSDOs.add(r.sdo)
      if (s === 'ONGOING' || s === 'ONGOING (FOR AWARD)') ongoingSDOs.add(r.sdo)
      if (s === 'AWARDED (FOR DELIVERY)') awardedForDelivery.add(r.sdo)
      if (s === 'AWARDED (ONGOING DELIVERY)') awardedOngoing.add(r.sdo)
      if (s === 'DONE' || s === 'COMPLETED') completedSDOs.add(r.sdo)
      totalDelivered += getBestSnapshotPacks(r)
    })

    return {
      total: uniqueSDOs.size, prep: prepSDOs.size, ongoing: ongoingSDOs.size,
      awardedDelivery: awardedForDelivery.size, awardedOngoing: awardedOngoing.size,
      completed: completedSDOs.size, totalDelivered,
      awarded: awardedForDelivery.size + awardedOngoing.size
    }
  }, [filteredRecords, reportDate])

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
  const reportDateFmt = fmtDate(reportDate)
  const reportDateShort = new Date(reportDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="flex flex-col h-full bg-slate-100 dark:bg-slate-900">
      {/* Control Bar — not printed */}
      <div className="bg-white dark:bg-slate-800 border-b px-6 py-3 flex flex-wrap gap-4 items-end sticky top-0 z-20 no-print">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Year</label>
          <select value={year} onChange={e => setYear(e.target.value)}
            className="h-9 px-3 rounded border text-sm bg-background">
            {['2024','2025','2026','2027'].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Report Date (As of)</label>
          <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
            className="h-9 px-3 rounded border text-sm bg-background" />
        </div>
        <div className="flex items-end gap-2">
          <Filter size={14} className="text-muted-foreground mb-2.5" />
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Delivery From</label>
            <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)}
              className="h-9 px-3 rounded border text-sm bg-background" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Delivery To</label>
            <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)}
              className="h-9 px-3 rounded border text-sm bg-background" />
          </div>
          {(filterStartDate || filterEndDate) && (
            <button onClick={() => { setFilterStartDate(''); setFilterEndDate('') }}
              className="h-9 px-3 rounded border text-sm text-muted-foreground hover:bg-muted mb-0">
              Clear Filter
            </button>
          )}
        </div>
        <div className="ml-auto">
          <button onClick={() => window.print()}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded shadow hover:bg-blue-700 transition text-sm font-semibold">
            <Printer size={15} />
            Print / Save PDF
          </button>
        </div>
      </div>

      {loading && <div className="p-12 text-center text-muted-foreground">Loading data...</div>}

      {!loading && (
        <div className="flex-1 overflow-auto p-8">
          {/* ══════════════════════════════════════════════════
              PAGE 1 — COVER LETTER
          ══════════════════════════════════════════════════ */}
          <div className="bg-white mx-auto shadow-lg print-page" id="page-1"
            style={{ width: '210mm', minHeight: '297mm', padding: '18mm 20mm', fontFamily: '"Times New Roman", Times, serif', fontSize: '11pt', lineHeight: 1.6, color: '#000', boxSizing: 'border-box' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', paddingBottom: '10px', borderBottom: '2px solid #166534', marginBottom: '18px' }}>
              {/* Bagong Pilipinas logo placeholder */}
              <div style={{ textAlign: 'center', fontSize: '9pt', color: '#1e3a5f', fontWeight: 700, width: 80 }}>
                <div style={{ fontSize: '22pt', lineHeight: 1 }}>🇵🇭</div>
                <div style={{ fontSize: '7pt', fontWeight: 700, letterSpacing: '0.02em' }}>BAGONG PILIPINAS</div>
              </div>
              {/* DA-PCC */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '8.5pt', color: '#374151' }}>Department of Agriculture</div>
                <div style={{ fontSize: '16pt', fontWeight: 900, letterSpacing: '0.02em', color: '#1e3a5f', lineHeight: 1.1 }}>PHILIPPINE CARABAO CENTER</div>
                <div style={{ fontSize: '7pt', color: '#6b7280', letterSpacing: '0.04em' }}>CERTIFIED: ISO 9001 | ISO 14001 | ISO 45001</div>
              </div>
            </div>

            <p style={{ marginBottom: '6px' }}>Reference No.: ___________</p>
            <p style={{ marginBottom: '16px' }}>{reportDateFmt}</p>

            <div style={{ marginBottom: '14px' }}>
              <p style={{ fontWeight: 700 }}>HON. PAOLO BENIGNO "BAM" AGUIERRE AQUINO IV</p>
              <p>Chairperson, Senate Committee on Basic Education</p>
              <p>Senate of the Philippines</p>
              <p>Pasay City</p>
            </div>

            <p style={{ marginBottom: '14px' }}>Subject: Submission of Narrative Report on the Procurement of Milk under the Milk Feeding Component of the DepEd School-Based Feeding Program</p>

            <p style={{ marginBottom: '14px' }}>Dear <strong>Senator Aquino</strong>:</p>
            <p style={{ marginBottom: '14px' }}>Greetings from the DA-Philippine Carabao Center (PCC).</p>

            <div style={{ textAlign: 'justify' }}>
              <p style={{ marginBottom: '12px' }}>
                In support of the implementation of the <strong>Milk Feeding Component of the Department of Education's (DepEd) School-Based Feeding Program (SBFP)</strong>, pursuant to <strong>Republic Act No. 11037, or the Masustansyang Pagkain para sa Batang Pilipino Act</strong>, and funded under the <strong>FY {year} General Appropriations Act (GAA)</strong>, we respectfully submit the attached <strong>Narrative Report on the Procurement of Milk</strong> for your information and reference.
              </p>
              <p style={{ marginBottom: '12px' }}>
                The report provides an update on the procurement and delivery of milk for <strong>{stats.total} Schools Division Offices (SDOs) nationwide</strong>, being facilitated by the PCC National Headquarters and Gene Pool and its twelve (12) Regional Centers. The procurement covers pasteurized and sterilized milk to be delivered in accordance with the approved feeding schedules and the DepEd school calendar.
              </p>
              <p style={{ marginBottom: '12px' }}>
                For the implementation of the FY {year} Milk Feeding Component, the PCC received funding. Remaining funds to complete the budget are still to be released in the coming months. These releases enabled the PCC to commence procurement activities, coordinate with participating SDOs, and mobilize its Regional Centers for nationwide implementation.
              </p>
              <p style={{ marginBottom: '12px' }}>
                The procurement is being undertaken in accordance with applicable government procurement laws and regulations, particularly <strong>Republic Act No. 11321, or the Sagip Saka Act</strong>, which prioritizes the direct procurement of agricultural and fishery products from accredited farmers' and fisherfolk cooperatives and organizations. Through this mechanism, qualified PCC-assisted dairy cooperatives are directly linked to a substantial institutional market for locally produced carabao milk, thereby supporting both child nutrition and the livelihood of Filipino dairy farmers.
              </p>
              <p style={{ marginBottom: '12px' }}>
                The attached report presents the current status of procurement and delivery, including the identified SDOs, the number of milk packs to be delivered, procurement status, and scheduled delivery periods. As of <strong>{reportDateFmt}</strong>, the report also highlights the initial accomplishments in milk delivery and identifies SDOs where procurement remains ongoing or in the preparatory stage.
              </p>
              <p style={{ marginBottom: '12px' }}>
                We hope that this report will be useful to your good office in your continuing efforts to support policies and programs that advance child nutrition, food security, local agricultural development, and inclusive livelihood opportunities for Filipino farmers.
              </p>
              <p style={{ marginBottom: '12px' }}>
                Thank you for your continued support and commitment to programs that benefit Filipino children and our agricultural communities.
              </p>
            </div>

            <div style={{ marginTop: '28px' }}>
              <p style={{ marginBottom: '48px' }}>Very truly yours,</p>
              <p style={{ fontWeight: 700 }}>LIZA G. BATTAD, PhD</p>
              <p>Executive Director III</p>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════
              PAGE 2+ — NARRATIVE REPORT TABLE
          ══════════════════════════════════════════════════ */}
          <div className="bg-white mx-auto shadow-lg mt-6 print-page" id="page-2"
            style={{ width: '210mm', minHeight: '297mm', padding: '14mm 14mm', fontFamily: '"Times New Roman", Times, serif', fontSize: '9.5pt', lineHeight: 1.5, color: '#000', boxSizing: 'border-box' }}>

            <p style={{ textAlign: 'center', fontWeight: 700, fontSize: '10pt', marginBottom: '8px', textTransform: 'uppercase' }}>
              Narrative Report on the Procurement of Milk under the Milk Feeding<br />
              Component of the DepEd's School-Based Feeding Program
            </p>

            <div style={{ textAlign: 'justify', marginBottom: '12px' }}>
              <p style={{ marginBottom: '8px' }}>
                Table 1 presents the list of SDOs covered by the milk procurement, including their respective delivery batches and other relevant procurement details.
              </p>
              <p>
                As of <strong>{reportDateFmt}</strong>, a total of <strong>{stats.totalDelivered.toLocaleString()} packs of milk</strong> have been delivered to <strong>{stats.completed} SDOs</strong>. Delivery to the SDOs is currently ongoing and is expected to be completed according to the schedules below. The procurement of milk for <strong>{stats.awarded} SDOs</strong> has already been awarded and is awaiting delivery, while procurement for <strong>{stats.ongoing} SDOs</strong> is currently ongoing. Meanwhile, the procurement for <strong>{stats.prep} SDOs</strong> is in the preparatory stage.
              </p>
            </div>

            <p style={{ fontWeight: 700, marginBottom: '4px', fontSize: '9pt' }}>Table 1. Status of Milk Procurement</p>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '8%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
              </colgroup>
              <thead className="sticky-header">
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center', fontWeight: 700 }}>Region</th>
                  <th style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center', fontWeight: 700 }}>Schools Division Office (SDO)</th>
                  <th style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center', fontWeight: 700 }}>Procurement Status</th>
                  <th style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center', fontWeight: 700 }}>No. of Milk Packs to be Delivered</th>
                  <th style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center', fontWeight: 700 }}>Expected Schedule of Delivery</th>
                  <th style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center', fontWeight: 700 }}>No. of Milk Packs Delivered as of {reportDateShort}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r, i) => {
                  const delivered = getBestSnapshotPacks(r)
                  return (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>{r.region}</td>
                      <td style={{ border: '1px solid #000', padding: '3px 5px' }}>{r.sdo}</td>
                      <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>{r.procurement_status}</td>
                      <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>
                        {r.packs_to_deliver ? Number(r.packs_to_deliver).toLocaleString() : '—'}
                        {r.milk_type && <div style={{ fontSize: '7.5pt', color: '#374151' }}>({r.milk_type})</div>}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>{r.delivery_schedule || '—'}</td>
                      <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center' }}>
                        {delivered > 0 ? Number(delivered).toLocaleString() : ''}
                      </td>
                    </tr>
                  )
                })}
                {/* Totals row */}
                <tr style={{ background: '#f3f4f6', fontWeight: 700 }}>
                  <td colSpan={2} style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center' }}>
                    TOTAL {stats.total} SDOs
                  </td>
                  <td colSpan={4} style={{ border: '1px solid #000', padding: '4px 8px', fontSize: '8pt' }}>
                    For Preparation – {stats.prep}{' | '}
                    Ongoing Procurement – {stats.ongoing}{' | '}
                    Awarded (Ongoing Delivery) – {stats.awardedOngoing}{' | '}
                    Awarded (For Delivery) – {stats.awardedDelivery}{' | '}
                    Completed – {stats.completed}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page {
            width: 100% !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 15mm 20mm !important;
            page-break-after: always;
          }
          #page-2 { padding: 12mm 14mm !important; }
          @page { size: A4; margin: 0; }
        }
        @media screen {
          .sticky-header th {
            position: sticky;
            top: 0;
            background-color: #f3f4f6;
            z-index: 10;
            outline: 1px solid #000; /* to maintain borders when sticky */
          }
        }
      `}</style>
    </div>
  )
}
