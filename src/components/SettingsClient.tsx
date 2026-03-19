'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Restaurant {
  id: number
  name: string
  code: string
  active: boolean
  created_at: string
}

export default function SettingsClient() {
  const supabase = createClient()
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { loadRestaurants() }, [])

  async function loadRestaurants() {
    setLoading(true)
    const { data } = await supabase
      .from('restaurants')
      .select('*')
      .order('created_at', { ascending: true })
    setRestaurants(data ?? [])
    setLoading(false)
  }

  async function addRestaurant() {
    if (!newName.trim()) return
    setSaving(true); setError(''); setSuccess('')
    const { error } = await supabase.from('restaurants').insert({
      name: newName.trim(),
      code: newCode.trim().toUpperCase(),
      active: true,
    })
    if (error) {
      setError(error.message.includes('unique') ? 'This restaurant already exists.' : error.message)
    } else {
      setSuccess('Restaurant added successfully!')
      setNewName(''); setNewCode(''); setAdding(false)
      loadRestaurants()
      setTimeout(() => setSuccess(''), 3000)
    }
    setSaving(false)
  }

  async function toggleActive(id: number, active: boolean) {
    await supabase.from('restaurants').update({ active: !active }).eq('id', id)
    setRestaurants(prev => prev.map(r => r.id === id ? { ...r, active: !active } : r))
  }

  async function deleteRestaurant(id: number, name: string) {
    if (!confirm(`Remove "${name}" from the restaurant list?`)) return
    await supabase.from('restaurants').delete().eq('id', id)
    setRestaurants(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your restaurant list and app settings.</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">{success}</div>
      )}

      {/* Restaurants */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Restaurants</h2>
            <p className="text-xs text-gray-400 mt-0.5">These appear as options when uploading inventory files.</p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-xs bg-blue-700 hover:bg-blue-800 text-white font-medium px-3.5 py-2 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" viewBox="0 0 16 16"><line x1="8" y1="1" x2="8" y2="15"/><line x1="1" y1="8" x2="15" y2="8"/></svg>
            Add Restaurant
          </button>
        </div>

        {/* Add form */}
        {adding && (
          <div className="px-5 py-4 bg-blue-50 border-b border-blue-100">
            <p className="text-sm font-medium text-blue-800 mb-3">New Restaurant</p>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name <span className="text-gray-400">(as it appears in Excel files)</span></label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. ALBAIK - BY XX01 - CITY NAME - 1007004"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Short Code <span className="text-gray-400">(optional)</span></label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={e => setNewCode(e.target.value)}
                    placeholder="e.g. XX01"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button onClick={addRestaurant} disabled={saving || !newName.trim()}
                  className="bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                  {saving ? 'Saving…' : 'Save Restaurant'}
                </button>
                <button onClick={() => { setAdding(false); setNewName(''); setNewCode(''); setError('') }}
                  className="border border-gray-200 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin"/>
            Loading…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Restaurant Name', 'Code', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500 border-b border-gray-100">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {restaurants.map(r => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                  <td className="px-5 py-3 font-mono text-gray-500 text-xs">{r.code || '—'}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => toggleActive(r.id, r.active)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${r.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {r.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => deleteRestaurant(r.id, r.name)}
                      className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-3 py-1 rounded-lg transition-colors">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
