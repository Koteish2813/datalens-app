import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import TopBar from '@/components/TopBar'
import Sidebar from '@/components/Sidebar'
import SessionGuard from '@/components/SessionGuard'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()

  // Single auth check — getUser() validates the JWT server-side, no extra DB call
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch profile only — user is already confirmed above
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role ?? 'viewer'
  const name = profile?.full_name ?? user.email ?? ''

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#0f1117',overflow:'hidden'}}>
      <SessionGuard />
      <TopBar userName={name} userRole={role}/>
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <Sidebar role={role}/>
        <main style={{flex:1,overflowY:'auto',background:'#0f1117',padding:'24px',paddingBottom:'80px'}}>{children}</main>
      </div>
    </div>
  )
}
