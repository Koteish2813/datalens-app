'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Clear any leftover session data on login page load
    try { sessionStorage.clear() } catch {}
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    // Record initial activity timestamp
    try { sessionStorage.setItem('dl_last_active', Date.now().toString()) } catch {}
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div style={{
      minHeight:'100vh', background:'#0f1117',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'"DM Sans",-apple-system,sans-serif', padding:20
    }}>
      {/* Background glow */}
      <div style={{position:'fixed', inset:0, overflow:'hidden', pointerEvents:'none'}}>
        <div style={{position:'absolute', top:'-20%', left:'30%', width:500, height:500, borderRadius:'50%', background:'rgba(79,142,247,0.06)', filter:'blur(80px)'}}/>
        <div style={{position:'absolute', bottom:'-10%', right:'20%', width:400, height:400, borderRadius:'50%', background:'rgba(109,92,247,0.05)', filter:'blur(60px)'}}/>
      </div>

      <div style={{width:'100%', maxWidth:420, position:'relative'}}>
        {/* Logo */}
        <div style={{textAlign:'center', marginBottom:40}}>
          <div style={{
            width:52, height:52, borderRadius:14,
            background:'linear-gradient(135deg, #4f8ef7, #6d5cf7)',
            display:'flex', alignItems:'center', justifyContent:'center',
            margin:'0 auto 16px', boxShadow:'0 8px 32px rgba(79,142,247,0.3)'
          }}>
            <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
              <polyline points="2,18 8,10 14,14 22,5"/>
            </svg>
          </div>
          <h1 style={{fontSize:24, fontWeight:800, color:'#f1f5f9', letterSpacing:'-0.03em', margin:'0 0 6px'}}>DataLens</h1>
          <p style={{fontSize:13, color:'#8892a4'}}>Restaurant Analytics Platform</p>
        </div>

        {/* Card */}
        <div style={{
          background:'#161b27', borderRadius:20,
          border:'1px solid #252d40', padding:'36px 32px',
          boxShadow:'0 24px 64px rgba(0,0,0,0.4)'
        }}>
          <h2 style={{fontSize:16, fontWeight:700, color:'#f1f5f9', marginBottom:4}}>Welcome back</h2>
          <p style={{fontSize:12, color:'#8892a4', marginBottom:28}}>Sign in to your account to continue</p>

          {error && (
            <div style={{background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'10px 14px', marginBottom:20, fontSize:12, color:'#ef4444'}}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{marginBottom:16}}>
              <label style={{display:'block', fontSize:11, fontWeight:700, color:'#8892a4', letterSpacing:'0.06em', marginBottom:6}}>EMAIL ADDRESS</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
                placeholder="you@company.com"
                style={{width:'100%', padding:'11px 14px', fontSize:13, background:'#1a2035', border:'1px solid #252d40', borderRadius:10, color:'#f1f5f9', outline:'none'}}/>
            </div>
            <div style={{marginBottom:28}}>
              <label style={{display:'block', fontSize:11, fontWeight:700, color:'#8892a4', letterSpacing:'0.06em', marginBottom:6}}>PASSWORD</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required
                placeholder="••••••••"
                style={{width:'100%', padding:'11px 14px', fontSize:13, background:'#1a2035', border:'1px solid #252d40', borderRadius:10, color:'#f1f5f9', outline:'none'}}/>
            </div>
            <button type="submit" disabled={loading} style={{
              width:'100%', padding:'12px', fontSize:14, fontWeight:700,
              background: loading ? '#252d40' : 'linear-gradient(135deg, #4f8ef7, #6d5cf7)',
              color: loading ? '#8892a4' : 'white',
              border:'none', borderRadius:10, cursor: loading?'not-allowed':'pointer',
              transition:'all 0.2s', boxShadow: loading?'none':'0 4px 16px rgba(79,142,247,0.3)'
            }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{textAlign:'center', fontSize:11, color:'#4a5568', marginTop:20}}>
          Access restricted to authorized users only
        </p>
      </div>
    </div>
  )
}
