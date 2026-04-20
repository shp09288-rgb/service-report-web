import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, updatePasswordHash } from '@/lib/settings'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!checkRateLimit(ip)) return err('Too many requests', 429)

  const body = await req.json().catch(() => null)
  if (!body) return err('Invalid JSON', 400)

  const { currentPassword, newPassword, confirmPassword } =
    body as { currentPassword?: string; newPassword?: string; confirmPassword?: string }

  if (!currentPassword || !newPassword || !confirmPassword) {
    return err('All fields are required', 400)
  }
  if (newPassword !== confirmPassword) {
    return err('New passwords do not match', 400)
  }
  if (newPassword.length < 4) {
    return err('New password must be at least 4 characters', 400)
  }

  const valid = await verifyPassword(currentPassword)
  if (!valid) return err('Current password is incorrect', 401)

  await updatePasswordHash(newPassword)
  return NextResponse.json({ ok: true })
}
