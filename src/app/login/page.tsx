'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--navy)' }}>
      {/* Left branding panel */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-700) 100%)',
        padding: '3rem', color: 'white'
      }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          {/* Logo placeholder */}
          <div style={{
            width: 90, height: 90, borderRadius: '50%',
            background: 'var(--gold)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem', fontSize: '2.5rem'
          }}>🐃</div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.5rem', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            DA-PCC Milk Feeding Program
          </h1>
          <p style={{ color: '#94a3b8', lineHeight: 1.6, fontSize: '0.95rem' }}>
            National Milk Feeding Program Monitoring System<br />
            Operations Department — Philippine Carabao Center
          </p>
        </div>
      </div>

      {/* Right login form */}
      <div style={{
        width: 440, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'white', padding: '3rem'
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--navy)', marginBottom: '0.4rem' }}>
            Sign In
          </h2>
          <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', marginBottom: '2rem' }}>
            Enter your credentials to access the system
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                placeholder="you@pcc.da.gov.ph"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div style={{
                background: '#fee2e2', color: '#b91c1c',
                padding: '0.75rem 1rem', borderRadius: 8,
                fontSize: '0.85rem', fontWeight: 500
              }}>
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', fontSize: '0.95rem' }}
            >
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
          </form>

          <p style={{ marginTop: '2rem', fontSize: '0.78rem', color: 'var(--gray-400)', textAlign: 'center' }}>
            Contact your system administrator to get access.
          </p>
        </div>
      </div>
    </div>
  )
}
