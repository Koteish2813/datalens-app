import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import UploadClient from '@/components/UploadClient'

export default async function UploadPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).maybeSingle()
  if (profile?.role !== 'admin') redirect('/dashboard')
  return <UploadClient />
}
