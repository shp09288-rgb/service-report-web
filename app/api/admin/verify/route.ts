import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { password } = (body ?? {}) as { password?: string }

  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    // No password configured — allow all (dev / unconfigured environment)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: password === adminPassword })
}
