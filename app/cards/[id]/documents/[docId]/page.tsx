import Link from 'next/link'
import { DocumentEditorClient } from '@/components/DocumentEditorClient'

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string; docId: string }>
}) {
  const { id, docId } = await params

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/dashboard" className="hover:text-blue-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/cards/${id}`} className="hover:text-blue-600">Card</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">Report {docId}</span>
      </div>

      {/* Read-only / auto-save state managed inside client component */}
      <DocumentEditorClient cardId={id} docId={docId} />
    </div>
  )
}
