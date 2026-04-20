import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword } from '@/lib/settings'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ ok: false, error: 'Too many requests' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const { password } = (body ?? {}) as { password?: string }

  if (!password) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const ok = await verifyPassword(password)
  return NextResponse.json({ ok })
}
