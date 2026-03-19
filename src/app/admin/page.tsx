import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminClient from '@/components/AdminClient'

export default async function AdminPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).maybeSingle()
  if (profile?.role !== 'super_admin') redirect('/dashboard')
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, role, created_at').order('created_at', { ascending: true })
  return <AdminClient initialProfiles={profiles ?? []} />
}
