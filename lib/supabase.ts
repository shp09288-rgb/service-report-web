import { createClient } from '@supabase/supabase-js'

// Placeholders let the module load at build time without real env vars.
// Actual Supabase calls will fail at runtime if these are not set.
const url      = process.env.NEXT_PUBLIC_SUPABASE_URL      || 'https://placeholder.supabase.co'
const anonKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY     || ''

// Client components — anon key, respects RLS
export const supabase = createClient(url, anonKey)

// Route handlers — service role key, bypasses RLS
export const supabaseAdmin = createClient(url, adminKey || anonKey)
