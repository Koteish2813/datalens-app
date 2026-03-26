import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const INACTIVITY_LIMIT = 30 * 60 * 1000 // 30 minutes
export const LAST_ACTIVE_KEY  = 'dl_last_active'
export const TAB_SESSION_KEY  = 'dl_tab_session'  // lives in sessionStorage — dies on tab close

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!client) {
    // Use DEFAULT storage (localStorage) so Supabase auth tokens
    // persist correctly across redirects and the password-reset flow.
    // We enforce "sign out on browser close" ourselves via TAB_SESSION_KEY.
    client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY)
  }
  return client
}

// Called once after a successful sign-in to mark this tab as active
export function startTabSession() {
  try {
    sessionStorage.setItem(TAB_SESSION_KEY, '1')
    sessionStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString())
  } catch {}
}

// Called on every protected page load — returns true if session should be killed
export function shouldKillSession(): boolean {
  try {
    // No tab session = browser was closed and reopened → kill
    const hasTab = sessionStorage.getItem(TAB_SESSION_KEY)
    if (!hasTab) return true

    // Inactivity check
    const last = sessionStorage.getItem(LAST_ACTIVE_KEY)
    if (last && Date.now() - parseInt(last) > INACTIVITY_LIMIT) return true

    return false
  } catch { return false }
}

export function touchActivity() {
  try { sessionStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString()) } catch {}
}

export function isInactive(): boolean {
  try {
    const last = sessionStorage.getItem(LAST_ACTIVE_KEY)
    if (!last) return false
    return Date.now() - parseInt(last) > INACTIVITY_LIMIT
  } catch { return false }
}

export async function forceSignOut() {
  try {
    sessionStorage.clear()
    // Don't clear remember-me keys from localStorage — user preference should persist
    const c = createClient()
    await c.auth.signOut()
  } catch {}
  window.location.href = '/login'
}

export function getSupabaseUrl() { return SUPABASE_URL }
export function getSupabaseKey() { return SUPABASE_KEY }
