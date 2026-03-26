'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

type Profile = { id: string; full_name: string; email: string; role: string; created_at: string }
type Role = 'super_admin' | 'admin' | 'sub_admin' | 'viewer'

const ROLES: Role[] = ['super_admin', 'admin', 'sub_admin', 'viewer']
const ROLE_LABELS: Record<Role, string> = { super_admin: 'Super Admin', admin: 'Admin', sub_admin: 'Sub-Admin', viewer: 'Viewer' }
const ROLE_COLORS: Record<Role, string> = {
  super_admin: 'bg-blue-100 text-blue-700 border-blue-200',
  admin:       'bg-purple-100 text-purple-700 border-purple-200',
  sub_admin:   'bg-amber-100 text-amber-700 border-amber-200',
  viewer:      'bg-gray-100 text-gray-600 border-gray-200',
}

export default function AdminClient() {
  const supabase = createClient()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('viewer')
  const [invitePassword, setInvitePassword] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{type:'success'|'error', text:string}|null>(null)
  const [updating, setUpdating] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadProfiles() }, [])

  async function loadProfiles() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setProfiles(data ?? [])
    setLoading(false)
  }

  async function inviteUser(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true); setInviteMsg(null)
    try {
      // Create user via Supabase auth admin API (requires service role key in real setup)
      // For now we use signUp — admin can use Supabase dashboard to invite too
      const { data, error } = await supabase.auth.signUp({
        email: inviteEmail,
        password: invitePassword,
        options: { data: { full_name: inviteName } }
      })
      if (error) throw error
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: inviteEmail,
          full_name: inviteName,
          role: inviteRole,
        })
        setProfiles(prev => [...prev, { id:data.user!.id, full_name:inviteName, email:inviteEmail, role:inviteRole, created_at: new Date().toISOString() }])
        setInviteMsg({ type:'success', text:`User ${inviteEmail} created successfully.` })
        setInviteEmail(''); setInvitePassword(''); setInviteName('')
      }
    } catch (err: any) {
      setInviteMsg({ type:'error', text: err.message ?? 'Failed to create user.' })
    }
    setInviting(false)
  }

  async function changeRole(id: string, role: Role) {
    setUpdating(id)
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (!error) setProfiles(prev => prev.map(p => p.id===id ? {...p, role} : p))
    setUpdating(null)
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Remove ${email} from DataLens?`)) return
    setUpdating(id)
    await supabase.from('profiles').delete().eq('id', id)
    setProfiles(prev => prev.filter(p => p.id !== id))
    setUpdating(null)
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">User Management</h1>
        <p className="text-sm text-gray-500 mt-0.5">Create users and manage their access roles.</p>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([
          { role:'super_admin', title:'Super Admin', desc:'Full access — upload, AI insights, manage users' },
          { role:'admin',       title:'Admin',       desc:'Upload files, AI insights, view all reports' },
          { role:'sub_admin',   title:'Sub-Admin',   desc:'View charts, stats, trends and data table' },
          { role:'viewer',      title:'Viewer',      desc:'Read-only access to reports and data table' },
        ] as const).map(r => (
          <div key={r.role} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${ROLE_COLORS[r.role]}`}>{r.title}</span>
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Create user form */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Create New User</h2>
        <form onSubmit={inviteUser} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Full Name</label>
            <input type="text" required value={inviteName} onChange={e=>setInviteName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Email Address</label>
            <input type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}
              placeholder="jane@company.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Password</label>
            <input type="password" required minLength={6} value={invitePassword} onChange={e=>setInvitePassword(e.target.value)}
              placeholder="Min. 6 characters"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Role</label>
            <select value={inviteRole} onChange={e=>setInviteRole(e.target.value as Role)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            {inviteMsg && (
              <div className={`mb-3 px-4 py-2.5 rounded-lg text-sm ${inviteMsg.type==='success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {inviteMsg.text}
              </div>
            )}
            <button type="submit" disabled={inviting}
              className="bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
              {inviting ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>

      {/* Users table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">All Users ({profiles.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 border-b border-gray-100">Name</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 border-b border-gray-100">Email</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 border-b border-gray-100">Role</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 border-b border-gray-100">Joined</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 border-b border-gray-100">Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{p.full_name || '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{p.email}</td>
                  <td className="px-5 py-3">
                    <select
                      value={p.role}
                      disabled={updating===p.id}
                      onChange={e => changeRole(p.id, e.target.value as Role)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer focus:outline-none ${ROLE_COLORS[p.role as Role] ?? ROLE_COLORS.viewer}`}
                    >
                      {ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {new Date(p.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => deleteUser(p.id, p.email)}
                      disabled={updating===p.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {profiles.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
