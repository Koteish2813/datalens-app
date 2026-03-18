import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import TopBar from '@/components/TopBar'
import Sidebar from '@/components/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle()
  const role = profile?.role ?? 'viewer'
  const name = profile?.full_name ?? user.email ?? ''
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar userName={name} userRole={role} userId={user.id}/>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar role={role}/>
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  )
}
