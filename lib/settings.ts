import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'

const PASSWORD_KEY = 'app.dashboard.password_hash'

// Returns the stored bcrypt hash, seeding from DASHBOARD_PASSWORD env var on
// first call if the settings row does not yet exist.
export async function getPasswordHash(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', PASSWORD_KEY)
    .single()

  if (!error && data) return data.value

  // Row missing — seed from env var (initial boot or fresh deploy)
  const envPassword = process.env.DASHBOARD_PASSWORD
  if (!envPassword) return null

  const hash = await bcrypt.hash(envPassword, 10)

  await supabaseAdmin
    .from('settings')
    .upsert({ key: PASSWORD_KEY, value: hash }, { onConflict: 'key', ignoreDuplicates: true })

  return hash
}

export async function verifyPassword(candidate: string): Promise<boolean> {
  const hash = await getPasswordHash()
  if (!hash) return false
  return bcrypt.compare(candidate, hash)
}

export async function updatePasswordHash(newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 10)
  await supabaseAdmin
    .from('settings')
    .upsert({ key: PASSWORD_KEY, value: hash }, { onConflict: 'key' })
}
