'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { shouldKillSession, forceSignOut, touchActivity, isInactive } from '@/lib/supabase'

const CHECK_INTERVAL = 60 * 1000
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click']

export default function SessionGuard() {
  const pathname = usePathname()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // On every navigation check if session should be killed
  useEffect(() => {
    if (shouldKillSession()) {
      forceSignOut()
      return
    }
    touchActivity()
  }, [pathname])

  useEffect(() => {
    // Record activity on user interactions
    const handleActivity = () => touchActivity()
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))

    // Periodic inactivity check every 60s
    intervalRef.current = setInterval(() => {
      if (isInactive()) forceSignOut()
    }, CHECK_INTERVAL)

    touchActivity()

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handleActivity))
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return null
}
