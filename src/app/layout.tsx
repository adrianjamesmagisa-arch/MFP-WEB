import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DA-PCC Milk Feeding Program',
  description: 'National Milk Feeding Program Monitoring System — Operations Department, Philippine Carabao Center',
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
