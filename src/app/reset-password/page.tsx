'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [done, setDone]           = useState(false)
  const [validSession, setValidSession] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Supabase sends the user here with a hash fragment containing the token
  // The SDK auto-exchanges it for a session
  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setValidSession(true)
      } else {
        // Wait briefly for the hash exchange to complete
        setTimeout(async () => {
          const { data: { session: s2 } } = await supabase.auth.getSession()
          if (s2) setValidSession(true)
          else setError('This reset link is invalid or has expired. Please request a new one.')
        }, 800)
      }
    }
    checkSession()
  }, [])

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    await supabase.auth.signOut()
    setDone(true)
    setLoading(false)

    // Redirect to login after 3 seconds
    setTimeout(() => router.push('/login'), 3000)
  }

  const inputStyle: React.CSSProperties = {
    width:'100%', padding:'11px 14px', fontSize:13,
    background:'#1a2035', border:'1px solid #252d40',
    borderRadius:10, color:'#f1f5f9', outline:'none',
    fontFamily:'"DM Sans",-apple-system,sans-serif',
  }
  const labelStyle: React.CSSProperties = {
    display:'block', fontSize:11, fontWeight:700,
    color:'#8892a4', letterSpacing:'0.06em', marginBottom:6,
  }

  const strength = password.length === 0 ? 0
    : password.length < 8 ? 1
    : password.length < 12 && !/[^a-zA-Z0-9]/.test(password) ? 2
    : 3
  const strengthLabel = ['','Weak','Fair','Strong']
  const strengthColor = ['','#ef4444','#f59e0b','#22c55e']

  return (
    <div style={{
      minHeight:'100vh', background:'#0f1117',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:'"DM Sans",-apple-system,sans-serif', padding:20,
    }}>
      <div style={{position:'fixed',inset:0,overflow:'hidden',pointerEvents:'none'}}>
        <div style={{position:'absolute',top:'-20%',left:'30%',width:500,height:500,borderRadius:'50%',background:'rgba(79,142,247,0.06)',filter:'blur(80px)'}}/>
      </div>

      <div style={{width:'100%',maxWidth:420,position:'relative'}}>
        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:40}}>
          <div style={{
            width:52,height:52,borderRadius:14,
            background:'linear-gradient(135deg,#4f8ef7,#6d5cf7)',
            display:'flex',alignItems:'center',justifyContent:'center',
            margin:'0 auto 16px',boxShadow:'0 8px 32px rgba(79,142,247,0.3)',
          }}>
            <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
              <polyline points="2,18 8,10 14,14 22,5"/>
            </svg>
          </div>
          <h1 style={{fontSize:24,fontWeight:800,color:'#f1f5f9',letterSpacing:'-0.03em',margin:'0 0 6px'}}>DataLens</h1>
          <p style={{fontSize:13,color:'#8892a4'}}>Restaurant Analytics Platform</p>
        </div>

        <div style={{background:'#161b27',borderRadius:20,border:'1px solid #252d40',padding:'36px 32px',boxShadow:'0 24px 64px rgba(0,0,0,0.4)'}}>

          {/* Success state */}
          {done ? (
            <div style={{textAlign:'center',padding:'8px 0'}}>
              <div style={{
                width:52,height:52,borderRadius:14,
                background:'rgba(34,197,94,0.15)',border:'1px solid rgba(34,197,94,0.3)',
                display:'flex',alignItems:'center',justifyContent:'center',
                margin:'0 auto 20px',
              }}>
                <svg width="24" height="24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
              </div>
              <h2 style={{fontSize:16,fontWeight:700,color:'#f1f5f9',marginBottom:8}}>Password updated!</h2>
              <p style={{fontSize:12,color:'#8892a4',lineHeight:1.6}}>
                Your password has been changed successfully. Redirecting you to sign in…
              </p>
            </div>

          ) : !validSession ? (
            /* Loading / invalid state */
            <div style={{textAlign:'center',padding:'16px 0'}}>
              {error ? (
                <>
                  <div style={{fontSize:32,marginBottom:16}}>🔗</div>
                  <h2 style={{fontSize:15,fontWeight:700,color:'#f1f5f9',marginBottom:8}}>Link expired</h2>
                  <p style={{fontSize:12,color:'#8892a4',marginBottom:24,lineHeight:1.6}}>{error}</p>
                  <button onClick={()=>router.push('/login')} style={{
                    padding:'10px 24px',fontSize:13,fontWeight:600,
                    background:'#4f8ef7',color:'white',border:'none',borderRadius:10,cursor:'pointer',
                  }}>Request new link</button>
                </>
              ) : (
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,color:'#8892a4',fontSize:13}}>
                  <div style={{width:16,height:16,border:'2px solid #252d40',borderTopColor:'#4f8ef7',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                  Verifying reset link…
                </div>
              )}
            </div>

          ) : (
            /* Reset form */
            <>
              <h2 style={{fontSize:16,fontWeight:700,color:'#f1f5f9',marginBottom:4}}>Set new password</h2>
              <p style={{fontSize:12,color:'#8892a4',marginBottom:28}}>Choose a strong password for your account.</p>

              {error && (
                <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:12,color:'#ef4444'}}>
                  {error}
                </div>
              )}

              <form onSubmit={handleReset}>
                <div style={{marginBottom:16}}>
                  <label style={labelStyle}>NEW PASSWORD</label>
                  <div style={{position:'relative'}}>
                    <input type={showPass?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} required
                      placeholder="Min. 8 characters" autoComplete="new-password"
                      style={{...inputStyle,paddingRight:44}}/>
                    <button type="button" onClick={()=>setShowPass(p=>!p)} style={{
                      position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',
                      background:'none',border:'none',cursor:'pointer',color:'#4a5568',padding:2,
                    }}>
                      {showPass
                        ? <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        : <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      }
                    </button>
                  </div>
                  {/* Strength bar */}
                  {password.length > 0 && (
                    <div style={{marginTop:8}}>
                      <div style={{display:'flex',gap:4,marginBottom:4}}>
                        {[1,2,3].map(i=>(
                          <div key={i} style={{flex:1,height:3,borderRadius:2,background:i<=strength?strengthColor[strength]:'#252d40',transition:'background 0.2s'}}/>
                        ))}
                      </div>
                      <p style={{fontSize:10,color:strengthColor[strength],fontWeight:600}}>{strengthLabel[strength]}</p>
                    </div>
                  )}
                </div>

                <div style={{marginBottom:28}}>
                  <label style={labelStyle}>CONFIRM PASSWORD</label>
                  <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required
                    placeholder="Repeat your password" autoComplete="new-password"
                    style={{
                      ...inputStyle,
                      borderColor: confirm && confirm !== password ? 'rgba(239,68,68,0.5)' : confirm && confirm === password ? 'rgba(34,197,94,0.5)' : '#252d40'
                    }}/>
                  {confirm && confirm === password && (
                    <p style={{fontSize:10,color:'#22c55e',marginTop:4,fontWeight:600}}>✓ Passwords match</p>
                  )}
                </div>

                <button type="submit" disabled={loading} style={{
                  width:'100%',padding:'12px',fontSize:14,fontWeight:700,
                  background: loading ? '#252d40' : 'linear-gradient(135deg,#4f8ef7,#6d5cf7)',
                  color: loading ? '#8892a4' : 'white',
                  border:'none',borderRadius:10,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition:'all 0.2s',
                  boxShadow: loading ? 'none' : '0 4px 16px rgba(79,142,247,0.3)',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                }}>
                  {loading && <div style={{width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>}
                  {loading ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
