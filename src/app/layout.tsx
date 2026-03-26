import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DataLens — Restaurant Analytics',
  description: 'Restaurant Analytics Platform',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      </head>
      <body style={{margin:0, fontFamily:'"DM Sans",-apple-system,sans-serif', background:'#0f1117', color:'#f1f5f9'}}>
        {children}
      </body>
    </html>
  )
}
