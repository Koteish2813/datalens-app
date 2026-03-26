'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { isInactive, forceSignOut, touchActivity } from '@/lib/supabase'

const CHECK_INTERVAL = 60 * 1000
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click']

export default function SessionGuard() {
  const pathname = usePathname()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // On every navigation just check inactivity — no network call needed
  useEffect(() => {
    if (isInactive()) {
      forceSignOut()
      return
    }
    touchActivity()
  }, [pathname])

  useEffect(() => {
    const handleActivity = () => touchActivity()
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handleActivity, { passive: true }))

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
