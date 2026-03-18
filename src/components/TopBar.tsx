'use client'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const roleBadge: Record<string, { label: string; color: string }> = {
  admin:     { label: 'Admin',     color: 'bg-blue-100 text-blue-700' },
  sub_admin: { label: 'Sub-Admin', color: 'bg-purple-100 text-purple-700' },
  viewer:    { label: 'Viewer',    color: 'bg-gray-100 text-gray-600' },
}

export default function TopBar({ userName, userRole, userId }: { userName: string; userRole: string; userId?: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [role, setRole] = useState(userRole)
  const [name, setName] = useState(userName)

  useEffect(() => {
    async function fetchRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single()
      if (profile?.role) setRole(profile.role)
      if (profile?.full_name) setName(profile.full_name)
    }
    fetchRole()
  }, [])

  const badge = roleBadge[role] ?? roleBadge.viewer

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-5 shrink-0 z-50">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 bg-blue-700 rounded-lg flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" viewBox="0 0 16 16">
            <polyline points="2,12 6,7 9,10 14,4"/>
          </svg>
        </div>
        <span className="font-semibold text-gray-900 text-[15px]">DataLens</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 hidden sm:block">{name || userName}</span>
        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${badge.color}`}>
          {badge.label}
        </span>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-colors">
          Sign out
        </button>
      </div>
    </header>
  )
}
