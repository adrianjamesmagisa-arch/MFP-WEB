'use client'

import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { UserModal } from './UserModal'
import { createClient } from '@/lib/supabase/client'

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalUser, setModalUser] = useState<any | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const supabase = createClient()

  const fetchUsers = async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete user: ${name}?`)) return
    
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
    if (res.ok) {
      fetchUsers()
    } else {
      const { error } = await res.json()
      alert('Failed to delete: ' + error)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Manage system access, roles, and center assignments</p>
        </div>
        <button className="btn btn-gold" onClick={() => { setModalUser(null); setIsModalOpen(true); }}>
          <Plus size={16} /> Add New User
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ background: '#f8fafc', padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>FULL NAME</th>
              <th style={{ background: '#f8fafc', padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>EMAIL</th>
              <th style={{ background: '#f8fafc', padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>ROLE</th>
              <th style={{ background: '#f8fafc', padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>CENTER</th>
              <th style={{ background: '#f8fafc', padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading users...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No users found</td></tr>
            ) : (
              users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 500, color: '#1e293b' }}>{u.full_name}</td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#475569' }}>{u.email}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 9999, fontSize: '0.7rem', fontWeight: 600,
                      background: u.role === 'super_admin' ? '#fef2f2' : u.role === 'encoder' ? '#eff6ff' : '#f1f5f9',
                      color: u.role === 'super_admin' ? '#ef4444' : u.role === 'encoder' ? '#3b82f6' : '#64748b'
                    }}>
                      {u.role.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#475569', fontWeight: 600 }}>
                    {u.center || <span style={{ color: '#cbd5e1', fontWeight: 400 }}>N/A</span>}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button onClick={() => { setModalUser(u); setIsModalOpen(true); }} className="btn btn-outline" style={{ padding: '0.35rem', color: '#3b82f6', borderColor: '#bfdbfe' }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(u.id, u.full_name)} className="btn btn-outline" style={{ padding: '0.35rem', color: '#ef4444', borderColor: '#fecaca' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <UserModal 
          user={modalUser} 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => { setIsModalOpen(false); fetchUsers(); }} 
        />
      )}
    </div>
  )
}
