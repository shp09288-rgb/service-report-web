import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Park Systems Service Report',
  description: 'Service and Installation Passdown Report Tool',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen text-gray-900 antialiased">
        <header className="bg-gray-800 text-white px-6 py-3 flex items-center gap-4">
          <Link
            href="/dashboard"
            className="font-bold tracking-wide text-sm hover:text-gray-200 transition-colors"
          >
            Park Systems
          </Link>
          <span className="text-gray-600 text-xs select-none">|</span>
          <span className="text-gray-400 text-xs">Service Report Tool</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
