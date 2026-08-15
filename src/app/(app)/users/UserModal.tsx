'use client'

import { useState } from 'react'
import { PCC_CENTERS } from '@/lib/types'
import { X } from 'lucide-react'

export function UserModal({ user, onClose, onSuccess }: { user?: any, onClose: () => void, onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    email: user?.email || '',
    password: '',
    full_name: user?.full_name || '',
    role: user?.role || 'viewer',
    center: user?.center || '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const isEdit = !!user

    const res = await fetch(isEdit ? `/api/users/${user.id}` : '/api/users', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Something went wrong')
      setLoading(false)
    } else {
      onSuccess()
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '0.75rem', width: '100%', maxWidth: 400, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>{user ? 'Edit User' : 'Add New User'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
            <X size={20} />
          </button>
        </div>

        {error && <div style={{ background: '#fef2f2', color: '#ef4444', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem', marginBottom: '1rem', border: '1px solid #fecaca' }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Email Address {user && '(Cannot change)'}</label>
            <input type="email" required disabled={!!user} className="form-input" style={{ width: '100%' }} value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
          </div>

          {!user && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Password</label>
              <input type="password" required minLength={6} className="form-input" style={{ width: '100%' }} value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Full Name</label>
            <input type="text" required className="form-input" style={{ width: '100%' }} value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Role</label>
            <select className="form-input" style={{ width: '100%' }} value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
              <option value="viewer">Viewer (Read-only)</option>
              <option value="encoder">Encoder (Write access to center)</option>
              <option value="super_admin">Super Admin (Full access)</option>
            </select>
          </div>

          {(form.role === 'encoder' || form.role === 'viewer') && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Assigned Center</label>
              <select className="form-input" style={{ width: '100%' }} value={form.center} onChange={e => setForm({...form, center: e.target.value})}>
                <option value="">— Select Center —</option>
                {PCC_CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={onClose} className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-gold" style={{ flex: 1, justifyContent: 'center' }}>
              {loading ? 'Saving...' : 'Save User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
