import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Transporte JR',
  description: 'Sistema de gestión operativa - Transporte José Rodríguez',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/assets/logos/logo-icon-64.png', sizes: '64x64', type: 'image/png' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
  other: {
    'theme-color': '#09090b',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
