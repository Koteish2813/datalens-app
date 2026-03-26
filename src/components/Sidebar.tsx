'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const NAV = [
  { href:'/dashboard',    label:'Dashboard',        roles:['super_admin','admin','sub_admin','viewer'], icon:<path d="M2 3h5v5H2zM9 3h5v5H9zM2 10h5v5H2zM9 10h5v5H9z"/> },
  { href:'/reports',      label:'Reports',          roles:['super_admin','admin','sub_admin','viewer'], icon:<><polyline points="1,12 5,7 9,10 14,4"/><line x1="1" y1="15" x2="14" y2="15"/></> },
  { href:'/consolidated', label:'Consolidated',     roles:['super_admin','admin','sub_admin'],          icon:<path d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V7l-5-5H5a2 2 0 00-2 2v14a2 2 0 002 2z"/> },
  { href:'/compare',      label:'Compare',          roles:['super_admin','admin','sub_admin','viewer'], icon:<><line x1="1" y1="8" x2="6" y2="8"/><line x1="9" y1="8" x2="14" y2="8"/><line x1="4" y1="4" x2="4" y2="12"/><line x1="12" y1="4" x2="12" y2="12"/></> },
  { href:'/projection',    label:'Projection & Order', roles:['super_admin','admin','sub_admin'],          icon:<><path d="M1 10l4-6 4 4 4-6"/><path d="M13 12h2v3h-2z"/><path d="M9 9h2v6H9z"/><path d="M5 11h2v4H5z"/></> },
  { div:true },
  { href:'/upload',       label:'Upload Data',      roles:['super_admin','admin'],                     icon:<><path d="M14 2H6a2 2 0 00-2 2v6"/><path d="M14 2l4 4M18 6h-4V2M12 18v-6M9 15l3 3 3-3"/></> },
  { href:'/bulk',         label:'Bulk Import',      roles:['super_admin','admin'],                     icon:<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/> },
  { div:true },
  { href:'/master',       label:'Master Menu',      roles:['super_admin','admin','sub_admin'],          icon:<><line x1="1" y1="3" x2="14" y2="3"/><line x1="1" y1="7" x2="14" y2="7"/><line x1="1" y1="11" x2="14" y2="11"/><line x1="1" y1="15" x2="14" y2="15"/></> },
  { href:'/recipes',      label:'Recipes & Cost',   roles:['super_admin','admin','sub_admin'],          icon:<><circle cx="8" cy="8" r="6"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="8" y1="5" x2="8" y2="11"/></> },
  { href:'/simulation',   label:'Price Simulation', roles:['super_admin','admin','sub_admin'],          icon:<path d="M13 10V3L4 14h7v7l9-11h-7z"/> },
  { div:true },
  { href:'/manage',       label:'Manage Data',      roles:['super_admin','admin'],                     icon:<><line x1="1" y1="4" x2="14" y2="4"/><line x1="1" y1="8" x2="14" y2="8"/><line x1="1" y1="12" x2="14" y2="12"/></> },
  { href:'/settings',     label:'Settings',         roles:['super_admin','admin'],                     icon:<><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5l1.5 1.5M3 13l1.5-1.5M11.5 4.5l1.5-1.5"/></> },
  { href:'/admin',        label:'Manage Users',     roles:['super_admin'],                             icon:<><circle cx="9" cy="5" r="3"/><path d="M1 14s1-4 8-4"/><path d="M13 11l2 2 4-4"/></> },
]

export default function Sidebar({ role }: { role: string }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => { setMobileOpen(false) }, [pathname])

  const visible = NAV.filter(i => i.div || (i.roles?.includes(role)))

  const NavContent = () => (
    <nav style={{flex:1, overflowY:'auto', padding:'8px 10px'}}>
      {visible.map((item, i) => {
        if (item.div) return <div key={i} style={{height:1, background:'#252d40', margin:'8px 0'}}/>
        const active = pathname === item.href
        return (
          <Link key={item.href} href={item.href!} style={{
            display:'flex', alignItems:'center', gap:10,
            padding:'9px 10px', borderRadius:8, marginBottom:2,
            background: active ? 'rgba(79,142,247,0.12)' : 'transparent',
            color: active ? '#4f8ef7' : '#8892a4',
            textDecoration:'none', transition:'all 0.15s',
            fontSize:12, fontWeight: active ? 600 : 400,
          }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 16 16">
              {item.icon}
            </svg>
            <span style={{flex:1}}>{item.label}</span>
            {active && <div style={{width:4, height:4, borderRadius:'50%', background:'#4f8ef7', flexShrink:0}}/>}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Desktop */}
      <aside style={{
        width:220, background:'#161b27',
        borderRight:'1px solid #252d40',
        display:'flex', flexDirection:'column',
        flexShrink:0, overflow:'hidden'
      }}>
        <NavContent/>
      </aside>

      {/* Mobile bottom bar */}
      <div style={{
        display:'none',
        position:'fixed', bottom:0, left:0, right:0,
        background:'#161b27', borderTop:'1px solid #252d40',
        zIndex:40, alignItems:'center',
        justifyContent:'space-around', padding:'6px 4px 8px'
      }} className="mobile-nav">
        {visible.filter(i=>!i.div).slice(0,4).map(item => {
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href!} style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:2,
              padding:'6px 10px', borderRadius:8, textDecoration:'none',
              color: active ? '#4f8ef7' : '#4a5568',
            }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 16 16">
                {item.icon}
              </svg>
              <span style={{fontSize:9, fontWeight: active?700:400}}>{item.label?.split(' ')[0]}</span>
            </Link>
          )
        })}
        <button onClick={()=>setMobileOpen(true)} style={{
          display:'flex', flexDirection:'column', alignItems:'center', gap:2,
          padding:'6px 10px', background:'transparent', border:'none', cursor:'pointer', color:'#4a5568'
        }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 16 16">
            <circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="14" cy="8" r="1.5"/>
          </svg>
          <span style={{fontSize:9}}>More</span>
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div style={{position:'fixed', inset:0, zIndex:50, display:'flex'}}>
          <div style={{flex:1, background:'rgba(0,0,0,0.6)'}} onClick={()=>setMobileOpen(false)}/>
          <div style={{width:260, background:'#161b27', borderLeft:'1px solid #252d40', display:'flex', flexDirection:'column'}}>
            <div style={{padding:'16px', borderBottom:'1px solid #252d40', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <span style={{fontSize:13, fontWeight:700, color:'#f1f5f9'}}>Menu</span>
              <button onClick={()=>setMobileOpen(false)} style={{background:'transparent', border:'none', cursor:'pointer', color:'#8892a4'}}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 16 16"><line x1="2" y1="2" x2="14" y2="14"/><line x1="14" y1="2" x2="2" y2="14"/></svg>
              </button>
            </div>
            <NavContent/>
          </div>
        </div>
      )}
    </>
  )
}
