'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatNumber } from '@/lib/utils'
import { Edit2, Trash2 } from 'lucide-react'

function EditableCell({ id, field, value, type = 'text', options, className, style, render, onSave }: { id: string, field: string, value: any, type?: string, options?: string[], className?: string, style?: any, render?: (v: any) => any, onSave?: (id: string, field: string, oldVal: any, newVal: any) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const supabase = createClient();

  useEffect(() => {
    setVal(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const save = async () => {
    if (val === value) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    let saveVal = val;
    if (type === 'number') {
      saveVal = val === '' ? null : Number(val);
    }
    try {
      const { error } = await supabase.from('sbfp_data').update({ [field]: saveVal }).eq('id', id);
      if (error) throw error;
      setIsEditing(false);
      if (onSave) onSave(id, field, value, saveVal);
    } catch (e) {
      console.error('Error saving:', e);
      setVal(value); // revert
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      save();
    } else if (e.key === 'Escape') {
      setVal(value);
      setIsEditing(false);
    }
  }

  if (isEditing) {
    if (type === 'select' && options) {
      return (
        <select
          ref={inputRef as any}
          value={val || ''}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="w-full h-8 px-1 text-sm border-2 border-blue-500 rounded outline-none"
        >
          <option value="">Select...</option>
          {options.map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )
    }

    return (
      <input
        ref={inputRef as any}
        type={type}
        value={val || ''}
        onChange={e => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        className={`w-full h-8 px-1 text-sm border-2 border-blue-500 rounded outline-none ${type === 'number' ? 'text-right' : ''}`}
      />
    )
  }

  const displayVal = render ? render(value) : value;

  return (
    <div 
      className={`group relative cursor-pointer min-h-[24px] rounded px-1 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${className || ''}`}
      style={style}
      onClick={() => setIsEditing(true)}
    >
      <span className={!displayVal && displayVal !== 0 ? 'text-slate-400 italic' : ''}>
        {displayVal || displayVal === 0 ? displayVal : 'Empty'}
      </span>
      <Edit2 className="absolute right-1 top-1.5 h-3 w-3 opacity-0 group-hover:opacity-100 text-blue-500" />
      {isSaving && (
        <div className="absolute inset-0 bg-white/50 dark:bg-black/50 flex items-center justify-center rounded">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      )}
    </div>
  )
}

export function SbfpDataTable({ 
  records, 
  userRole 
}: { 
  records: any[]
  userRole?: string 
}) {
  const router = useRouter()
  const supabase = createClient()
  const [localRecords, setLocalRecords] = useState(records)

  useEffect(() => {
    setLocalRecords(records)
  }, [records])

  const handleSave = (id: string, field: string, oldVal: any, newVal: any) => {
    setLocalRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: newVal } : r))
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this record?')) return
    
    try {
      const { error } = await supabase.from('sbfp_data').delete().eq('id', id)
      if (error) throw error
      setLocalRecords(prev => prev.filter(r => r.id !== id))
      router.refresh()
    } catch (e) {
      console.error('Error deleting:', e)
      alert('Failed to delete record')
    }
  }

  const statusOptions = ['For Preparation', 'Ongoing (For Award)', 'Awarded (For Delivery)', 'Awarded (Ongoing Delivery)', 'Ongoing', 'Completed', 'Not Started']
  const milkTypeOptions = ['Pasteurized', 'Sterilized', 'Commercial', 'SM']

  return (
    <div className="rounded-md border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 whitespace-nowrap">
              <th className="h-10 px-4 text-left font-medium text-muted-foreground w-16">Year</th>
              <th className="h-10 px-4 text-left font-medium text-muted-foreground">Region</th>
              <th className="h-10 px-4 text-left font-medium text-muted-foreground">SDO</th>
              <th className="h-10 px-4 text-left font-medium text-muted-foreground">Procurement Status</th>
              <th className="h-10 px-4 text-right font-medium text-muted-foreground">Packs to Deliver</th>
              <th className="h-10 px-4 text-left font-medium text-muted-foreground">Milk Type</th>
              <th className="h-10 px-4 text-left font-medium text-muted-foreground">Delivery Schedule</th>
              <th className="h-10 px-4 text-right font-medium text-muted-foreground">Packs Delivered</th>
              <th className="h-10 px-4 text-left font-medium text-muted-foreground">Center</th>
              {userRole !== 'viewer' && (
                <th className="h-10 px-4 text-right font-medium text-muted-foreground w-16">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {localRecords.length === 0 ? (
              <tr>
                <td colSpan={10} className="h-24 text-center text-muted-foreground">
                  No SBFP records found.
                </td>
              </tr>
            ) : (
              localRecords.map((record) => (
                <tr key={record.id} className="border-b hover:bg-muted/50 whitespace-nowrap">
                  <td className="px-4 py-2">
                    {userRole !== 'viewer' ? (
                      <EditableCell id={record.id} field="year" value={record.year} type="number" onSave={handleSave} />
                    ) : record.year}
                  </td>
                  <td className="px-4 py-2">
                    {userRole !== 'viewer' ? (
                      <EditableCell id={record.id} field="region" value={record.region} onSave={handleSave} />
                    ) : record.region}
                  </td>
                  <td className="px-4 py-2">
                    {userRole !== 'viewer' ? (
                      <EditableCell id={record.id} field="sdo" value={record.sdo} onSave={handleSave} />
                    ) : record.sdo}
                  </td>
                  <td className="px-4 py-2">
                    {userRole !== 'viewer' ? (
                      <EditableCell id={record.id} field="procurement_status" value={record.procurement_status} type="select" options={statusOptions} onSave={handleSave} />
                    ) : record.procurement_status}
                  </td>
                  <td className="px-4 py-2">
                    {userRole !== 'viewer' ? (
                      <EditableCell id={record.id} field="packs_to_deliver" value={record.packs_to_deliver} type="number" render={formatNumber} className="text-right" onSave={handleSave} />
                    ) : <div className="text-right">{formatNumber(record.packs_to_deliver)}</div>}
                  </td>
                  <td className="px-4 py-2">
                    {userRole !== 'viewer' ? (
                      <EditableCell id={record.id} field="milk_type" value={record.milk_type} type="select" options={milkTypeOptions} onSave={handleSave} />
                    ) : record.milk_type}
                  </td>
                  <td className="px-4 py-2">
                    {userRole !== 'viewer' ? (
                      <EditableCell id={record.id} field="delivery_schedule" value={record.delivery_schedule} onSave={handleSave} />
                    ) : record.delivery_schedule}
                  </td>
                  <td className="px-4 py-2">
                    {userRole !== 'viewer' ? (
                      <EditableCell id={record.id} field="packs_delivered" value={record.packs_delivered} type="number" render={formatNumber} className="text-right" onSave={handleSave} />
                    ) : <div className="text-right">{formatNumber(record.packs_delivered)}</div>}
                  </td>
                  <td className="px-4 py-2">
                    {userRole !== 'viewer' ? (
                      <EditableCell id={record.id} field="center" value={record.center} onSave={handleSave} />
                    ) : record.center}
                  </td>
                  
                  {userRole !== 'viewer' && (
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="p-2 hover:bg-destructive/10 text-destructive rounded transition-colors"
                        title="Delete record"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
