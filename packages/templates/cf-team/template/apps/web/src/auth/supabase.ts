/**
 * Supabase auth client configuration for __APP_NAME__.
 *
 * Scaffolded per arch-6 §13 Q3 RESOLVED. The CLI emits this file only when
 * the user picks `auth: 'supabase'`. Pair it with the matching
 * `.env.example.supabase` for the env-var contract.
 *
 * Docs: https://supabase.com/docs/reference/javascript/initializing
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[__APP_NAME__/auth/supabase] Missing required env: SUPABASE_URL, SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type SupabaseClient = typeof supabase
