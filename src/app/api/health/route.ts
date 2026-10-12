import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Health check endpoint for container orchestrators, load balancers,
 * uptime monitors, and Cloudflare health checks.
 */
export async function GET() {
  const start = Date.now()
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('profiles').select('id').limit(1)

    if (error) {
      return NextResponse.json(
        {
          status: 'degraded',
          database: 'error',
          message: error.message,
          durationMs: Date.now() - start,
        },
        { status: 503 },
      )
    }

    return NextResponse.json(
      {
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    )
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: err?.message || String(err),
        durationMs: Date.now() - start,
      },
      { status: 500 },
    )
  }
}
