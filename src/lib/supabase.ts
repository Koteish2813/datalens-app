import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY)
  }
  return client
}

export function getSupabaseUrl() {
  return SUPABASE_URL
}

export function getSupabaseKey() {
  return SUPABASE_KEY
}
