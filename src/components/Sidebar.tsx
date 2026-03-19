'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const navItems = [
  { href:'/dashboard', label:'Dashboard',    roles:['super_admin','admin','sub_admin','viewer'], icon:'M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z' },
  { href:'/reports',   label:'Reports',      roles:['super_admin','admin','sub_admin','viewer'], icon:'M1 12l4-5 3 2 4-5 3 2M1 15h14' },
  { href:'/upload',    label:'Upload Data',  roles:['super_admin','admin'],                     icon:'M14 2H6a2 2 0 0 0-2 2v6M14 2l4 4M18 6h-4V2M12 18v-6M9 15l3 3 3-3' },
  { href:'/admin',     label:'Manage Users', roles:['super_admin'],                             icon:'M10 8a3 3 0 100-6 3 3 0 000 6zM1 14s1-4 9-4', divider:true },
]

export default function Sidebar({ role: initialRole }: { role: string }) {
  const pathname = usePathname()
  const [role, setRole] = useState(initialRole)
  const supabase = createClient()

  useEffect(() => {
    async function fetchRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role) setRole(profile.role)
    }
    fetchRole()
  }, [])

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col py-4 shrink-0 hidden md:flex">
      <nav className="flex flex-col gap-0.5 px-3">
        {navItems.filter(i => i.roles.includes(role)).map(item => {
          const active = pathname === item.href
          return (
            <div key={item.href}>
              {item.divider && <div className="my-2 border-t border-gray-100"/>}
              <Link href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 16 16">
                  <path d={item.icon}/>
                </svg>
                {item.label}
              </Link>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
