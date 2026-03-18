import { createServerSupabaseClient } from '@/lib/supabase-server'

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).maybeSingle()
  const role = profile?.role ?? 'viewer'

  // Get upload log
  const { data: uploads } = await supabase.from('upload_log').select('*').order('uploaded_at', { ascending: false }).limit(20)

  // Get quick counts
  const tables = ['hourly_sales','delivery_sales','meal_count','menu_mix','inventory']
  const counts: Record<string, number> = {}
  for (const t of tables) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
    counts[t] = count ?? 0
  }

  const labels: Record<string, string> = {
    hourly_sales: 'Hourly Sales',
    delivery_sales: 'Delivery Sales',
    meal_count: 'Meal Count',
    menu_mix: 'Menu Mix',
    inventory: 'Inventory',
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overview of all uploaded restaurant data.</p>
      </div>

      {/* Data counts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {tables.map(t => (
          <div key={t} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{labels[t]}</p>
            <p className="text-xl font-semibold font-mono text-gray-900">{counts[t].toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-0.5">records</p>
          </div>
        ))}
      </div>

      {/* Upload log */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Recent Uploads</h2>
        </div>
        {uploads && uploads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {['File','Type','Restaurant','Date','Rows','Uploaded At'].map(h=>(
                    <th key={h} className="text-left px-4 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {uploads.map((u: any) => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-700 max-w-[180px] truncate">{u.file_name}</td>
                    <td className="px-4 py-2.5"><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{labels[u.report_type] ?? u.report_type}</span></td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-[200px] truncate">{u.restaurant_name}</td>
                    <td className="px-4 py-2.5 text-gray-600 font-mono">{u.date}</td>
                    <td className="px-4 py-2.5 text-gray-600 font-mono">{u.rows_inserted}</td>
                    <td className="px-4 py-2.5 text-gray-400">{new Date(u.uploaded_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-gray-400">
            No uploads yet.{role === 'admin' ? ' Go to Upload Data to get started.' : ' An admin needs to upload data first.'}
          </div>
        )}
      </div>
    </div>
  )
}
