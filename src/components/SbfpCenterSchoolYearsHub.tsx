'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Package, School, Users } from 'lucide-react'
import { SbfpCreateSchoolYearButton } from '@/components/SbfpCreateSchoolYearButton'
import type { CenterSchoolYearCard } from '@/lib/sbfp-school-years'
import { schoolYearLabel } from '@/lib/sbfp-year'

export function SbfpCenterSchoolYearsHub({
  center,
  centerLabel,
  years,
  workspaceBasePath,
  userRole,
}: {
  center: string
  centerLabel: string
  years: CenterSchoolYearCard[]
  workspaceBasePath: string
  userRole?: string | null
}) {
  const editable = userRole !== 'viewer'
  const existingLabels = years.map(y => y.sy)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 20,
          marginBottom: 28,
          padding: '28px 32px',
          borderRadius: 20,
          background: 'linear-gradient(135deg, #0a1628 0%, #1e3a6e 72%)',
          color: '#fff',
          boxShadow: '0 12px 32px rgba(10,22,40,0.18)',
        }}
      >
        <div style={{ minWidth: 240, flex: '1 1 360px' }}>
          <div style={{
            display: 'inline-block',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--gold)',
            marginBottom: 8,
          }}>
            SBFP monitoring
          </div>
          <h1 style={{
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: 'clamp(1.7rem, 3vw, 2.15rem)',
            fontWeight: 800,
            lineHeight: 1.2,
            margin: 0,
            color: '#fff',
          }}>
            {centerLabel}
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 18, lineHeight: 1.5, color: '#dbe4f0', maxWidth: 640 }}>
            Open a school year to work on procurement and drop-off schools.
            Create another year when you need a new blank page.
          </p>
        </div>
        {editable && (
          <div style={{ flex: '0 0 auto' }}>
            <SbfpCreateSchoolYearButton center={center} existingYears={existingLabels} />
          </div>
        )}
      </header>

      {years.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '64px 28px',
          borderRadius: 20,
          border: '2px dashed #cbd5e1',
          background: '#fff',
        }}>
          <CalendarDays size={40} color="#64748b" style={{ margin: '0 auto 14px' }} />
          <p style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
            No school years yet
          </p>
          <p style={{ fontSize: 17, color: '#475569', marginTop: 8, maxWidth: 460, marginInline: 'auto', lineHeight: 1.5 }}>
            Create a school year to start a blank monitoring workspace for {center}.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {years.map(card => (
            <Link
              key={card.sy}
              href={`${workspaceBasePath}?sy=${encodeURIComponent(card.sy)}`}
              className="sbfp-year-card"
              style={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                background: '#fff',
                borderRadius: 20,
                border: '1px solid #e2e8f0',
                boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
                overflow: 'hidden',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '20px 24px 16px',
                borderBottom: '1px solid #f1f5f9',
              }}>
                <div>
                  <div style={{
                    fontFamily: 'Plus Jakarta Sans, sans-serif',
                    fontSize: 26,
                    fontWeight: 800,
                    color: '#0a1628',
                    lineHeight: 1.15,
                  }}>
                    {schoolYearLabel(card.sy)}
                  </div>
                  <div style={{ fontSize: 16, color: '#475569', marginTop: 4 }}>
                    Tap to open this year’s monitoring
                  </div>
                </div>
                <span style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'var(--gold-pale)', color: '#92400e',
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>
                  <ArrowRight size={22} />
                </span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                padding: 20,
              }}>
                <Stat icon={<Users size={20} />} label="SDOs" value={card.sdoCount} />
                <Stat icon={<Package size={20} />} label="Packs to deliver" value={card.packsToDeliver.toLocaleString()} />
                <Stat icon={<School size={20} />} label="Drop-off schools" value={card.dropoffSchools} />
                <Stat icon={<CalendarDays size={20} />} label="Ongoing" value={card.ongoing} tone="blue" />
              </div>

              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                padding: '0 20px 20px',
              }}>
                <Chip label="For preparation" count={card.forPreparation} color="#b45309" bg="#fff7ed" />
                <Chip label="Awarded" count={card.awarded} color="#6d28d9" bg="#f5f3ff" />
                <Chip label="Completed" count={card.completed} color="#15803d" bg="#f0fdf4" />
                {card.failed > 0 && <Chip label="Failed" count={card.failed} color="#b91c1c" bg="#fef2f2" />}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string | number
  tone?: 'blue'
}) {
  return (
    <div style={{
      padding: '14px 14px 12px',
      borderRadius: 14,
      background: tone === 'blue' ? '#eff6ff' : '#f8fafc',
      border: `1px solid ${tone === 'blue' ? '#bfdbfe' : '#e2e8f0'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tone === 'blue' ? '#1d4ed8' : '#475569', marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

function Chip({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      minHeight: 34,
      padding: '4px 12px',
      borderRadius: 999,
      background: bg,
      color,
      fontSize: 15,
      fontWeight: 700,
    }}>
      {label}: {count}
    </span>
  )
}
