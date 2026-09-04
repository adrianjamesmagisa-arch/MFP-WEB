export const SBFP_PPMP_TYPE = '__PPMP__'
export const SBFP_HIRING_TYPE = '__HIRING__'

export function isSbfpAuxRow(row: { milk_type?: string | null }): boolean {
  const t = row?.milk_type || ''
  return t === SBFP_PPMP_TYPE || t === SBFP_HIRING_TYPE
}

export function excludeAuxSbfp<T extends { milk_type?: string | null }>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter(r => !isSbfpAuxRow(r))
}

export function toPpmpRow(r: any) {
  return {
    id: r.id,
    year: r.year,
    center: r.center,
    category: r.delivery_schedule || 'office_supplies',
    status: r.procurement_status || '',
    item_name: r.sdo === '—' ? '' : (r.sdo || ''),
    amount: Number(r.amount) || 0,
    mode_of_procurement: r.mode_of_procurement || '',
    date_received: r.pr_date_received ? String(r.pr_date_received).slice(0, 10) : '',
    pr_number: r.pr_number || '',
    ors_date: r.ors_date ? String(r.ors_date).slice(0, 10) : '',
    po_number: r.po_number || '',
    remarks: r.remarks || '',
    sort_order: 0,
  }
}

export function toHiringRow(r: any) {
  return {
    id: r.id,
    year: r.year,
    center: r.center,
    status: r.procurement_status || '',
    position: r.sdo === '—' ? '' : (r.sdo || ''),
    base_salary: Number(r.amount) || 0,
    remarks: r.remarks || '',
    sort_order: 0,
  }
}
