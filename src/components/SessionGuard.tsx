'use client'
import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient, touchActivity, isInactive, forceSignOut } from '@/lib/supabase'

const CHECK_INTERVAL = 60 * 1000 // check every 60 seconds
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click']

export default function SessionGuard() {
  const router = useRouter()
  const pathname = usePathname()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // On every navigation, touch activity and check session
    async function checkSession() {
      // Check inactivity first
      if (isInactive()) {
        await forceSignOut()
        return
      }

      // Verify session still exists
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = '/login'
        return
      }

      // Record activity on page load
      touchActivity()
    }

    checkSession()
  }, [pathname]) // re-runs on every route change

  useEffect(() => {
    // Record activity on user interactions
    const handleActivity = () => touchActivity()
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))

    // Periodic inactivity check every 60s
    intervalRef.current = setInterval(async () => {
      if (isInactive()) {
        await forceSignOut()
      }
    }, CHECK_INTERVAL)

    // Initial touch
    touchActivity()

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity))
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // This component renders nothing — it's purely a behavior hook
  return null
}
