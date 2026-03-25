'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const navItems = [
  { href:'/dashboard',    label:'Dashboard',      roles:['super_admin','admin','sub_admin','viewer'], icon:'M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z' },
  { href:'/reports',      label:'Reports',        roles:['super_admin','admin','sub_admin','viewer'], icon:'M1 12l4-5 3 2 4-5 3 2M1 15h14' },
  { href:'/compare',      label:'Compare',        roles:['super_admin','admin','sub_admin','viewer'], icon:'M1 8h6M9 8h6M4 4v8M12 4v8' },
  { href:'/consolidated', label:'Consolidated',   roles:['super_admin','admin','sub_admin'],          icon:'M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V7l-5-5H5a2 2 0 00-2 2v14a2 2 0 002 2z' },
  { href:'/upload',       label:'Upload Data',    roles:['super_admin','admin'],                      icon:'M14 2H6a2 2 0 0 0-2 2v6M14 2l4 4M18 6h-4V2M12 18v-6M9 15l3 3 3-3' },
  { href:'/master',       label:'Master Menu',    roles:['super_admin','admin','sub_admin'],          icon:'M1 2h14v2H1zM1 6h14v2H1zM1 10h14v2H1zM1 14h14v2H1z' },
  { href:'/recipes',      label:'Recipes & Cost', roles:['super_admin','admin','sub_admin'],          icon:'M8 2a6 6 0 100 12A6 6 0 008 2zM5 8h6M8 5v6' },
  { href:'/simulation',   label:'Price Simulation',roles:['super_admin','admin','sub_admin'],          icon:'M13 10V3L4 14h7v7l9-11h-7z' },
  { href:'/manage',       label:'Manage Data',    roles:['super_admin','admin'],                      icon:'M1 4h14M1 8h14M1 12h14', divider:true },
  { href:'/settings',     label:'Settings',       roles:['super_admin','admin'],                      icon:'M8 1a7 7 0 100 14A7 7 0 008 1zM8 5v3l2 2' },
  { href:'/admin',        label:'Manage Users',   roles:['super_admin'],                              icon:'M10 8a3 3 0 100-6 3 3 0 000 6zM1 14s1-4 9-4' },
]

export default function Sidebar({ role: initialRole }: { role: string }) {
  const pathname = usePathname()
  const [role, setRole] = useState(initialRole)
  const [mobileOpen, setMobileOpen] = useState(false)
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

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const visibleItems = navItems.filter(i => i.roles.includes(role))

  const NavLinks = () => (
    <nav className="flex flex-col gap-0.5 px-3">
      {visibleItems.map(item => {
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
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col py-4 shrink-0 hidden md:flex">
        <NavLinks/>
      </aside>

      {/* Mobile bottom bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 flex items-center justify-around px-2 py-1 safe-bottom">
        {/* Show only top 4 most used items + menu button */}
        {visibleItems.slice(0, 4).map(item => {
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-0 ${active ? 'text-blue-700' : 'text-gray-400'}`}>
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 16 16">
                <path d={item.icon}/>
              </svg>
              <span className="text-[10px] font-medium truncate max-w-[52px]">{item.label.split(' ')[0]}</span>
            </Link>
          )
        })}
        {/* More button */}
        <button onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-gray-400 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" viewBox="0 0 16 16">
            <circle cx="2" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="14" cy="8" r="1"/>
          </svg>
          <span className="text-[10px] font-medium">More</span>
        </button>
      </div>

      {/* Mobile full menu drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)}/>
          {/* Drawer */}
          <div className="relative ml-auto w-64 bg-white h-full flex flex-col py-4 shadow-xl">
            <div className="flex items-center justify-between px-4 mb-3">
              <span className="font-semibold text-gray-900">Menu</span>
              <button onClick={() => setMobileOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><line x1="2" y1="2" x2="14" y2="14"/><line x1="14" y1="2" x2="2" y2="14"/></svg>
              </button>
            </div>
            <NavLinks/>
          </div>
        </div>
      )}
    </>
  )
}
