import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import RecipesClient from '@/components/RecipesClient'

export default async function RecipesPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).maybeSingle()
  if (!['super_admin','admin','sub_admin'].includes(profile?.role ?? '')) redirect('/dashboard')
  return <RecipesClient />
}
