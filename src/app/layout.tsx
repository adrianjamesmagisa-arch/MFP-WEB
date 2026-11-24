import type { Metadata } from 'next'
import './globals.css'

const siteUrl =
  process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_SITE_URL || 'https://mfp-web-beta.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'DA-PCC Milk Feeding Program',
  description: 'National Milk Feeding Program Monitoring System — Operations Department, Philippine Carabao Center',
  openGraph: {
    type: 'website',
    siteName: 'DA-PCC Milk Feeding Program',
    title: 'DA-PCC Milk Feeding Program',
    description: 'Operations Department · Philippine Carabao Center',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'DA-PCC Milk Feeding Program — Operations Department, Philippine Carabao Center',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DA-PCC Milk Feeding Program',
    description: 'Operations Department · Philippine Carabao Center',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}
