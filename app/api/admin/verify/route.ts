import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword } from '@/lib/settings'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { password } = (body ?? {}) as { password?: string }

  if (!password) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const ok = await verifyPassword(password)
  return NextResponse.json({ ok })
}
