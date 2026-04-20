import type { Metadata } from 'next'
import { AppHeader } from '@/components/AppHeader'
import './globals.css'

export const metadata: Metadata = {
  title: 'Park Systems Service Report',
  description: 'Service and Installation Passdown Report Tool',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen text-gray-900 antialiased">
        <AppHeader />
        <main>{children}</main>
      </body>
    </html>
  )
}
