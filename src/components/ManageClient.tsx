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

const typeColors: Record<string, string> = {
  hourly_sales:   'bg-blue-50 text-blue-700',
  delivery_sales: 'bg-purple-50 text-purple-700',
  meal_count:     'bg-green-50 text-green-700',
  menu_mix:       'bg-amber-50 text-amber-700',
  inventory:      'bg-red-50 text-red-700',
}

function groupKey(g: UploadGroup) { return `${g.restaurant_name}__${g.date}__${g.report_type}` }

export default function ManageClient() {
  const supabase = createClient()
  const [groups, setGroups]                 = useState<UploadGroup[]>([])
  const [loading, setLoading]               = useState(true)
  const [deleting, setDeleting]             = useState<string | null>(null)
  const [bulkDeleting, setBulkDeleting]     = useState(false)
  const [filterType, setFilterType]         = useState<string>('all')
  const [filterRestaurant, setFilterRestaurant] = useState<string>('all')
  const [restaurants, setRestaurants]       = useState<string[]>([])
  const [selected, setSelected]             = useState<Set<string>>(new Set())
  const [confirmSingle, setConfirmSingle]   = useState<UploadGroup | null>(null)
  const [confirmBulk, setConfirmBulk]       = useState(false)
  const [successMsg, setSuccessMsg]         = useState('')

  useEffect(() => { loadGroups() }, [])

  async function loadGroups() {
    setLoading(true)
    setSelected(new Set())
    const all: UploadGroup[] = []
    const restSet = new Set<string>()

    for (const type of REPORT_TYPES) {
      const { data } = await supabase.from(REPORT_TABLES[type]).select('restaurant_name, date')
      if (!data) continue
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

    all.sort((a, b) => b.date.localeCompare(a.date))
    setGroups(all)
    setRestaurants(Array.from(restSet).sort())
    setLoading(false)
  }

  // ── Single delete ──────────────────────────────────────────────────────
  async function deleteSingle(group: UploadGroup) {
    const key = groupKey(group)
    setDeleting(key)
    setConfirmSingle(null)
    const { error } = await supabase.from(REPORT_TABLES[group.report_type])
      .delete().eq('restaurant_name', group.restaurant_name).eq('date', group.date)
    if (!error) {
      setGroups(prev => prev.filter(g => groupKey(g) !== key))
      setSelected(prev => { const n = new Set(prev); n.delete(key); return n })
      showSuccess(`Deleted ${group.count} rows — ${REPORT_LABELS[group.report_type]} · ${group.date}`)
    }
    setDeleting(null)
  }

  // ── Bulk delete ────────────────────────────────────────────────────────
  async function deleteBulk() {
    setBulkDeleting(true)
    setConfirmBulk(false)
    const toDelete = filtered.filter(g => selected.has(groupKey(g)))
    let totalRows = 0

    for (const group of toDelete) {
      await supabase.from(REPORT_TABLES[group.report_type])
        .delete().eq('restaurant_name', group.restaurant_name).eq('date', group.date)
      totalRows += group.count
    }

    const deletedKeys = new Set(toDelete.map(groupKey))
    setGroups(prev => prev.filter(g => !deletedKeys.has(groupKey(g))))
    setSelected(new Set())
    setBulkDeleting(false)
    showSuccess(`Bulk deleted ${toDelete.length} entries · ${totalRows.toLocaleString()} rows removed`)
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 5000)
  }

  // ── Selection helpers ──────────────────────────────────────────────────
  function toggleOne(key: string) {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  function toggleAll() {
    const filteredKeys = filtered.map(groupKey)
    const allSelected = filteredKeys.every(k => selected.has(k))
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); filteredKeys.forEach(k => n.delete(k)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); filteredKeys.forEach(k => n.add(k)); return n })
    }
  }

  const filtered = groups.filter(g => {
    if (filterType !== 'all' && g.report_type !== filterType) return false
    if (filterRestaurant !== 'all' && g.restaurant_name !== filterRestaurant) return false
    return true
  })

  const filteredKeys   = filtered.map(groupKey)
  const selectedInView = filteredKeys.filter(k => selected.has(k))
  const allSelected    = filteredKeys.length > 0 && filteredKeys.every(k => selected.has(k))
  const someSelected   = selectedInView.length > 0 && !allSelected
  const selectedCount  = selectedInView.length
  const selectedRows   = filtered.filter(g => selected.has(groupKey(g))).reduce((s, g) => s + g.count, 0)

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Manage Data</h1>
        <p className="text-sm text-gray-500 mt-0.5">View, filter and delete uploaded data — select multiple entries for bulk deletion.</p>
      </div>

      {/* Success */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 16 16" strokeLinecap="round"><polyline points="1,8 5,12 15,3"/></svg>
          {successMsg}
        </div>
      )}

      {/* Filters + Bulk Action Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Type:</label>
          <select className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
            value={filterType} onChange={e => { setFilterType(e.target.value); setSelected(new Set()) }}>
            <option value="all">All Types</option>
            {REPORT_TYPES.map(t => <option key={t} value={t}>{REPORT_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Restaurant:</label>
          <select className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
            value={filterRestaurant} onChange={e => { setFilterRestaurant(e.target.value); setSelected(new Set()) }}>
            <option value="all">All Restaurants</option>
            {restaurants.map(r => <option key={r} value={r}>{r.split(' - ')[2] || r}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {selectedCount > 0 && (
            <button onClick={() => setConfirmBulk(true)} disabled={bulkDeleting}
              className="flex items-center gap-2 text-xs font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-lg transition-colors">
              {bulkDeleting
                ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" viewBox="0 0 14 14"><polyline points="1,4 13,4"/><path d="M2,4l1,9h8l1-9"/><path d="M5,4V2h4v2"/></svg>}
              Delete {selectedCount} selected ({selectedRows.toLocaleString()} rows)
            </button>
          )}
          <button onClick={loadGroups}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 16 16" strokeLinecap="round"><path d="M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8zM8 5v3l2 2"/></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Single delete confirm */}
      {confirmSingle && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Delete this data?</h3>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 my-3 text-sm">
              <p className="font-medium text-red-800">{REPORT_LABELS[confirmSingle.report_type]}</p>
              <p className="text-red-600 mt-0.5">{confirmSingle.restaurant_name}</p>
              <p className="text-red-600">Date: {confirmSingle.date} · {confirmSingle.count} records</p>
            </div>
            <p className="text-xs text-gray-400 mb-4">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmSingle(null)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg">Cancel</button>
              <button onClick={() => deleteSingle(confirmSingle)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 rounded-lg">
                Delete {confirmSingle.count} records
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirm */}
      {confirmBulk && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Bulk delete {selectedCount} entries?</h3>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 my-3 text-sm max-h-48 overflow-y-auto">
              {filtered.filter(g => selected.has(groupKey(g))).map((g, i) => (
                <div key={i} className="flex justify-between items-center py-1 border-b border-red-100 last:border-0">
                  <span className="text-red-700 font-medium">{REPORT_LABELS[g.report_type]}</span>
                  <span className="text-red-500 text-xs">{g.date} · {g.count} rows</span>
                </div>
              ))}
            </div>
            <p className="text-sm font-semibold text-red-700 mb-1">Total: {selectedRows.toLocaleString()} rows will be deleted</p>
            <p className="text-xs text-gray-400 mb-4">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmBulk(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg">Cancel</button>
              <button onClick={deleteBulk}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 rounded-lg">
                Delete all {selectedRows.toLocaleString()} rows
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Uploaded Data</h2>
          <div className="flex items-center gap-3">
            {selectedCount > 0 && (
              <span className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                {selectedCount} selected
              </span>
            )}
            <span className="text-xs text-gray-400">{filtered.length} entries</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-400 text-sm">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin"/>Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No data found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {/* Select all checkbox */}
                  <th className="px-4 py-2.5 w-10 border-b border-gray-100">
                    <div onClick={toggleAll} style={{
                      width:16, height:16, borderRadius:4, cursor:'pointer',
                      background: allSelected ? '#ef4444' : someSelected ? '#fca5a5' : 'transparent',
                      border: `2px solid ${allSelected || someSelected ? '#ef4444' : '#d1d5db'}`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      {(allSelected || someSelected) && (
                        <svg width="9" height="9" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 10 10">
                          {allSelected ? <polyline points="1,5 4,8 9,2"/> : <line x1="2" y1="5" x2="8" y2="5"/>}
                        </svg>
                      )}
                    </div>
                  </th>
                  {['Report Type', 'Restaurant', 'Date', 'Records', 'Action'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((g, i) => {
                  const key = groupKey(g)
                  const isDeleting = deleting === key
                  const isSelected = selected.has(key)
                  return (
                    <tr key={i} className={`border-b border-gray-50 transition-colors ${isDeleting ? 'opacity-40' : isSelected ? 'bg-red-50/60' : 'hover:bg-gray-50'}`}>
                      <td className="px-4 py-2.5">
                        <div onClick={() => !isDeleting && toggleOne(key)} style={{
                          width:16, height:16, borderRadius:4, cursor:'pointer',
                          background: isSelected ? '#ef4444' : 'transparent',
                          border: `2px solid ${isSelected ? '#ef4444' : '#d1d5db'}`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                        }}>
                          {isSelected && (
                            <svg width="9" height="9" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 10 10">
                              <polyline points="1,5 4,8 9,2"/>
                            </svg>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${typeColors[g.report_type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {REPORT_LABELS[g.report_type]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-[200px] truncate">{g.restaurant_name.split(' - ')[2] || g.restaurant_name}</td>
                      <td className="px-4 py-2.5 text-gray-600 font-mono">{g.date}</td>
                      <td className="px-4 py-2.5 text-gray-600 font-mono">{g.count}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setConfirmSingle(g)} disabled={isDeleting}
                          className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-40 border border-red-200 hover:border-red-300 px-3 py-1 rounded-lg transition-colors">
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
