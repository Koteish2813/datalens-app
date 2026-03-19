import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ManageClient from '@/components/ManageClient'

export default async function ManagePage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).maybeSingle()
  if (!['super_admin', 'admin'].includes(profile?.role ?? '')) redirect('/dashboard')
  return <ManageClient />
}
