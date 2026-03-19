'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { REPORT_LABELS, REPORT_TABLES, type ReportType } from '@/lib/excel-parser'

const REPORT_TYPES: ReportType[] = ['hourly_sales', 'delivery_sales', 'meal_count', 'menu_mix', 'inventory']

interface UploadGroup {
  restaurant_name: string
  date: string
  report_type: ReportType
  count: number
}

export default function ManageClient() {
  const supabase = createClient()
  const [groups, setGroups] = useState<UploadGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterRestaurant, setFilterRestaurant] = useState<string>('all')
  const [restaurants, setRestaurants] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState<UploadGroup | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => { loadGroups() }, [])

  async function loadGroups() {
    setLoading(true)
    const all: UploadGroup[] = []
    const restSet = new Set<string>()

    for (const type of REPORT_TYPES) {
      const { data } = await supabase
        .from(REPORT_TABLES[type])
        .select('restaurant_name, date')

      if (!data) continue

      // Group by restaurant + date
      const grouped: Record<string, number> = {}
      data.forEach((r: any) => {
        const key = `${r.restaurant_name}__${r.date}`
        grouped[key] = (grouped[key] || 0) + 1
        restSet.add(r.restaurant_name)
      })

      Object.entries(grouped).forEach(([key, count]) => {
        const [restaurant_name, date] = key.split('__')
        all.push({ restaurant_name, date, report_type: type, count })
      })
    }

    // Sort by date desc
    all.sort((a, b) => b.date.localeCompare(a.date))
    setGroups(all)
    setRestaurants(Array.from(restSet).sort())
    setLoading(false)
  }

  async function deleteGroup(group: UploadGroup) {
    const key = `${group.restaurant_name}__${group.date}__${group.report_type}`
    setDeleting(key)
    setConfirmDelete(null)

    const { error } = await supabase
      .from(REPORT_TABLES[group.report_type])
      .delete()
      .eq('restaurant_name', group.restaurant_name)
      .eq('date', group.date)

    if (!error) {
      setGroups(prev => prev.filter(g =>
        !(g.restaurant_name === group.restaurant_name &&
          g.date === group.date &&
          g.report_type === group.report_type)
      ))
      setSuccessMsg(`Deleted ${group.count} rows from ${REPORT_LABELS[group.report_type]} — ${group.restaurant_name} — ${group.date}`)
      setTimeout(() => setSuccessMsg(''), 4000)
    }
    setDeleting(null)
  }

  const filtered = groups.filter(g => {
    if (filterType !== 'all' && g.report_type !== filterType) return false
    if (filterRestaurant !== 'all' && g.restaurant_name !== filterRestaurant) return false
    return true
  })

  const typeColors: Record<string, string> = {
    hourly_sales:   'bg-blue-50 text-blue-700',
    delivery_sales: 'bg-purple-50 text-purple-700',
    meal_count:     'bg-green-50 text-green-700',
    menu_mix:       'bg-amber-50 text-amber-700',
    inventory:      'bg-red-50 text-red-700',
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Manage Data</h1>
        <p className="text-sm text-gray-500 mt-0.5">View and delete uploaded data by restaurant, date and report type.</p>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 16 16" strokeLinecap="round"><polyline points="1,8 5,12 15,3"/></svg>
          {successMsg}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Type:</label>
          <select className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            {REPORT_TYPES.map(t => <option key={t} value={t}>{REPORT_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Restaurant:</label>
          <select className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white" value={filterRestaurant} onChange={e => setFilterRestaurant(e.target.value)}>
            <option value="all">All Restaurants</option>
            {restaurants.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button onClick={loadGroups} className="ml-auto text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 16 16" strokeLinecap="round"><path d="M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8zM8 5v3l2 2"/></svg>
          Refresh
        </button>
      </div>

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Delete this data?</h3>
            <p className="text-sm text-gray-500 mb-1">This will permanently delete:</p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 my-3 text-sm">
              <p className="font-medium text-red-800">{REPORT_LABELS[confirmDelete.report_type]}</p>
              <p className="text-red-600 mt-0.5">{confirmDelete.restaurant_name}</p>
              <p className="text-red-600">Date: {confirmDelete.date}</p>
              <p className="text-red-600">{confirmDelete.count} records</p>
            </div>
            <p className="text-xs text-gray-400 mb-4">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteGroup(confirmDelete)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
                Delete {confirmDelete.count} records
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Uploaded Data</h2>
          <span className="text-xs text-gray-400">{filtered.length} entries</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-400 text-sm">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin"/>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No data found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {['Report Type', 'Restaurant', 'Date', 'Records', 'Action'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((g, i) => {
                  const key = `${g.restaurant_name}__${g.date}__${g.report_type}`
                  const isDeleting = deleting === key
                  return (
                    <tr key={i} className={`border-b border-gray-50 ${isDeleting ? 'opacity-40' : 'hover:bg-gray-50'}`}>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${typeColors[g.report_type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {REPORT_LABELS[g.report_type]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-[220px] truncate">{g.restaurant_name}</td>
                      <td className="px-4 py-2.5 text-gray-600 font-mono">{g.date}</td>
                      <td className="px-4 py-2.5 text-gray-600 font-mono">{g.count}</td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => setConfirmDelete(g)}
                          disabled={isDeleting}
                          className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-40 transition-colors border border-red-200 hover:border-red-300 px-3 py-1 rounded-lg"
                        >
                          {isDeleting ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
