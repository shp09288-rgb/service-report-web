import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Park Systems Service Report',
  description: 'Service and Installation Passdown Report Tool',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen text-gray-900 antialiased">
        <header className="bg-gray-800 text-white px-6 py-3 flex items-center gap-3">
          <span className="font-bold tracking-wide text-sm">Park Systems</span>
          <span className="text-gray-400 text-xs">Service Report Tool</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
