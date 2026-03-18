import { createServerSupabaseClient } from '@/lib/supabase-server'
import ReportsClient from '@/components/ReportsClient'

export default async function ReportsPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).maybeSingle()
  return <ReportsClient role={profile?.role ?? 'viewer'} />
}
