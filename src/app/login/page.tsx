'use client'
import { useState, useEffect } from 'react'
import { createClient, startTabSession } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type View = 'login' | 'forgot' | 'forgot_sent'

const REMEMBER_EMAIL_KEY = 'dl_remember_email'
const REMEMBER_ME_KEY    = 'dl_remember_me'

export default function LoginPage() {
  const [view, setView]           = useState<View>('login')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [showPass, setShowPass]   = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // On mount: clear session but restore remembered email if any
  useEffect(() => {
    // Only clear tab/inactivity keys — NOT localStorage auth tokens
    try { sessionStorage.removeItem('dl_last_active') } catch {}
    try { sessionStorage.removeItem('dl_tab_session') } catch {}
    try {
      const remembered = localStorage.getItem(REMEMBER_EMAIL_KEY)
      const wasRemembered = localStorage.getItem(REMEMBER_ME_KEY)
      if (remembered && wasRemembered === 'true') {
        setEmail(remembered)
        setRememberMe(true)
      }
    } catch {}
  }, [])

  // ── Sign In ──────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Incorrect email or password. Please try again.'
        : error.message)
      setLoading(false)
      return
    }

    // Handle Remember Me
    try {
      if (rememberMe) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, email)
        localStorage.setItem(REMEMBER_ME_KEY, 'true')
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY)
        localStorage.removeItem(REMEMBER_ME_KEY)
      }
    } catch {}

    // Mark this tab as active (enforces sign-out on browser close)
    startTabSession()

    window.location.href = '/dashboard'
  }

  // ── Forgot Password ──────────────────────────────────────────
  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setLoading(false)
    setView('forgot_sent')
  }

  // ── Shared styles ────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', fontSize: 13,
    background: '#1a2035', border: '1px solid #252d40',
    borderRadius: 10, color: '#f1f5f9', outline: 'none',
    transition: 'border-color 0.15s',
    fontFamily: '"DM Sans",-apple-system,sans-serif',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700,
    color: '#8892a4', letterSpacing: '0.06em', marginBottom: 6,
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0f1117',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"DM Sans",-apple-system,sans-serif', padding: 20,
    }}>
      {/* Background glows */}
      <div style={{position:'fixed',inset:0,overflow:'hidden',pointerEvents:'none'}}>
        <div style={{position:'absolute',top:'-20%',left:'30%',width:500,height:500,borderRadius:'50%',background:'rgba(79,142,247,0.06)',filter:'blur(80px)'}}/>
        <div style={{position:'absolute',bottom:'-10%',right:'20%',width:400,height:400,borderRadius:'50%',background:'rgba(109,92,247,0.05)',filter:'blur(60px)'}}/>
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

        {/* Card */}
        <div style={{background:'#161b27',borderRadius:20,border:'1px solid #252d40',padding:'36px 32px',boxShadow:'0 24px 64px rgba(0,0,0,0.4)'}}>

          {/* ── LOGIN VIEW ── */}
          {view === 'login' && (
            <>
              <h2 style={{fontSize:16,fontWeight:700,color:'#f1f5f9',marginBottom:4}}>Welcome back</h2>
              <p style={{fontSize:12,color:'#8892a4',marginBottom:28}}>Sign in to your account to continue</p>

              {error && (
                <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:12,color:'#ef4444',display:'flex',gap:8,alignItems:'flex-start'}}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 16 16" style={{flexShrink:0,marginTop:1}}>
                    <circle cx="8" cy="8" r="7"/><line x1="8" y1="5" x2="8" y2="8"/><line x1="8" y1="11" x2="8" y2="11"/>
                  </svg>
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin}>
                <div style={{marginBottom:16}}>
                  <label style={labelStyle}>EMAIL ADDRESS</label>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
                    placeholder="you@company.com" autoComplete="email" style={inputStyle}/>
                </div>

                <div style={{marginBottom:20}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <label style={{...labelStyle,marginBottom:0}}>PASSWORD</label>
                    <button type="button" onClick={()=>setView('forgot')} style={{
                      background:'none',border:'none',cursor:'pointer',
                      fontSize:11,color:'#4f8ef7',fontWeight:600,padding:0,
                    }}>Forgot password?</button>
                  </div>
                  <div style={{position:'relative'}}>
                    <input type={showPass?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} required
                      placeholder="••••••••" autoComplete="current-password"
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
                </div>

                {/* Remember Me */}
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:28}}>
                  <div onClick={()=>setRememberMe(p=>!p)} style={{
                    width:18,height:18,borderRadius:5,cursor:'pointer',flexShrink:0,
                    background: rememberMe ? '#4f8ef7' : 'transparent',
                    border: `2px solid ${rememberMe ? '#4f8ef7' : '#252d40'}`,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    transition:'all 0.15s',
                  }}>
                    {rememberMe && <svg width="10" height="10" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3"/></svg>}
                  </div>
                  <span style={{fontSize:12,color:'#8892a4',cursor:'pointer',userSelect:'none'}} onClick={()=>setRememberMe(p=>!p)}>
                    Remember my email on this device
                  </span>
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
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            </>
          )}

          {/* ── FORGOT PASSWORD VIEW ── */}
          {view === 'forgot' && (
            <>
              <button onClick={()=>{setView('login');setError('')}} style={{
                display:'flex',alignItems:'center',gap:6,
                background:'none',border:'none',cursor:'pointer',
                color:'#8892a4',fontSize:12,fontWeight:600,padding:0,marginBottom:20,
              }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 16 16"><polyline points="10,4 4,8 10,12"/></svg>
                Back to sign in
              </button>

              <h2 style={{fontSize:16,fontWeight:700,color:'#f1f5f9',marginBottom:4}}>Reset your password</h2>
              <p style={{fontSize:12,color:'#8892a4',marginBottom:28}}>Enter your email address and we'll send you a link to reset your password.</p>

              {error && (
                <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:8,padding:'10px 14px',marginBottom:20,fontSize:12,color:'#ef4444'}}>
                  {error}
                </div>
              )}

              <form onSubmit={handleForgot}>
                <div style={{marginBottom:24}}>
                  <label style={labelStyle}>EMAIL ADDRESS</label>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
                    placeholder="you@company.com" autoComplete="email" style={inputStyle}/>
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
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
            </>
          )}

          {/* ── FORGOT SENT VIEW ── */}
          {view === 'forgot_sent' && (
            <div style={{textAlign:'center',padding:'8px 0'}}>
              <div style={{
                width:52,height:52,borderRadius:14,
                background:'rgba(34,197,94,0.15)',border:'1px solid rgba(34,197,94,0.3)',
                display:'flex',alignItems:'center',justifyContent:'center',
                margin:'0 auto 20px',
              }}>
                <svg width="24" height="24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h2 style={{fontSize:16,fontWeight:700,color:'#f1f5f9',marginBottom:8}}>Check your email</h2>
              <p style={{fontSize:12,color:'#8892a4',marginBottom:6,lineHeight:1.6}}>
                We sent a password reset link to
              </p>
              <p style={{fontSize:13,fontWeight:700,color:'#4f8ef7',marginBottom:20}}>{email}</p>
              <p style={{fontSize:11,color:'#4a5568',marginBottom:28,lineHeight:1.6}}>
                Click the link in the email to set a new password. The link expires in 1 hour. Check your spam folder if you don't see it.
              </p>
              <button onClick={()=>{setView('login');setError('')}} style={{
                width:'100%',padding:'11px',fontSize:13,fontWeight:600,
                background:'transparent',color:'#4f8ef7',
                border:'1px solid rgba(79,142,247,0.3)',borderRadius:10,cursor:'pointer',
              }}>
                Back to Sign In
              </button>
            </div>
          )}
        </div>

        <p style={{textAlign:'center',fontSize:11,color:'#4a5568',marginTop:20}}>
          Access restricted to authorized users only
        </p>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
