import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/db'

// Placeholders let the module load at build time without real env vars.
// Actual Supabase calls will fail at runtime if these are not set.
const url      = process.env.NEXT_PUBLIC_SUPABASE_URL      || 'https://placeholder.supabase.co'
const anonKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY     || ''

// Client components — anon key, respects RLS
export const supabase = createClient<Database>(url, anonKey)

// Route handlers — service role key, bypasses RLS.
// Throws at first use if the key is missing so the error is clearly reported
// rather than silently degrading to anon-key access.
export const supabaseAdmin: SupabaseClient<Database> = adminKey
  ? createClient<Database>(url, adminKey)
  : new Proxy({} as SupabaseClient<Database>, {
      get() {
        throw new Error(
          'SUPABASE_SERVICE_ROLE_KEY is not set. Admin operations require the service role key.'
        )
      },
    })
