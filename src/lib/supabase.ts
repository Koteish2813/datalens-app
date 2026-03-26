import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const INACTIVITY_LIMIT = 30 * 60 * 1000 // 30 minutes in ms
const LAST_ACTIVE_KEY = 'dl_last_active'

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        // Do NOT persist session to localStorage — session dies when browser closes
        persistSession: false,
        // Still use storage for the inactivity check (sessionStorage)
        storage: {
          getItem: (key: string) => {
            try { return sessionStorage.getItem(key) } catch { return null }
          },
          setItem: (key: string, value: string) => {
            try { sessionStorage.setItem(key, value) } catch {}
          },
          removeItem: (key: string) => {
            try { sessionStorage.removeItem(key) } catch {}
          },
        },
      },
    })
  }
  return client
}

// Call this on every user interaction to reset the inactivity timer
export function touchActivity() {
  try { sessionStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString()) } catch {}
}

// Returns true if the user has been inactive for more than 30 minutes
export function isInactive(): boolean {
  try {
    const last = sessionStorage.getItem(LAST_ACTIVE_KEY)
    if (!last) return false // No record yet — treat as active
    return Date.now() - parseInt(last) > INACTIVITY_LIMIT
  } catch { return false }
}

// Sign out and clear all session data
export async function forceSignOut() {
  try {
    sessionStorage.clear()
    const c = createClient()
    await c.auth.signOut()
  } catch {}
  window.location.href = '/login'
}

export function getSupabaseUrl() { return SUPABASE_URL }
export function getSupabaseKey() { return SUPABASE_KEY }
