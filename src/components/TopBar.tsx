'use client'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const ROLE_BADGE: Record<string,{label:string;color:string}> = {
  super_admin: { label:'Super Admin', color:'#4f8ef7' },
  admin:       { label:'Admin',       color:'#a78bfa' },
  sub_admin:   { label:'Sub-Admin',   color:'#f59e0b' },
  viewer:      { label:'Viewer',      color:'#8892a4' },
}

export default function TopBar({ userName, userRole, userId }: { userName:string; userRole:string; userId?:string }) {
  const router = useRouter()
  const supabase = createClient()
  const [role, setRole] = useState(userRole)
  const [name, setName] = useState(userName)

  useEffect(() => {
    async function fetchRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
      if (profile?.role) setRole(profile.role)
      if (profile?.full_name) setName(profile.full_name)
    }
    fetchRole()
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.viewer

  return (
    <header style={{
      height:56, background:'#161b27',
      borderBottom:'1px solid #252d40',
      display:'flex', alignItems:'center',
      justifyContent:'space-between',
      padding:'0 24px', flexShrink:0, zIndex:50
    }}>
      {/* Logo */}
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <div style={{
          width:30, height:30, borderRadius:8,
          background:'linear-gradient(135deg, #4f8ef7, #6d5cf7)',
          display:'flex', alignItems:'center', justifyContent:'center'
        }}>
          <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 16 16">
            <polyline points="1,12 5,7 9,10 15,4"/>
          </svg>
        </div>
        <div>
          <span style={{fontSize:14, fontWeight:800, color:'#f1f5f9', letterSpacing:'-0.02em'}}>DataLens</span>
          <span style={{fontSize:10, color:'#4a5568', marginLeft:8}}>Restaurant Analytics</span>
        </div>
      </div>

      {/* Right */}
      <div style={{display:'flex', alignItems:'center', gap:12}}>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <div style={{width:6, height:6, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 8px #22c55e'}}/>
          <span style={{fontSize:11, color:'#22c55e', fontWeight:600}}>Live</span>
        </div>
        <div style={{width:1, height:20, background:'#252d40'}}/>
        <span style={{fontSize:12, color:'#8892a4'}}>{name || userName}</span>
        <span style={{
          fontSize:10, fontWeight:700,
          background: badge.color + '20',
          color: badge.color,
          padding:'3px 10px', borderRadius:20
        }}>{badge.label}</span>
        <button onClick={logout} style={{
          fontSize:11, fontWeight:600, color:'#8892a4',
          background:'transparent', border:'1px solid #252d40',
          borderRadius:8, padding:'6px 12px', cursor:'pointer',
          transition:'all 0.15s'
        }}>Sign out</button>
      </div>
    </header>
  )
}
