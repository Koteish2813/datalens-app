'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { parseExcelFile, REPORT_LABELS, REPORT_TABLES, type ReportType } from '@/lib/excel-parser'
import { C, card, btnPrimary, btnGhost, inputStyle, selectStyle, badge } from '@/lib/ds'

type UploadStatus = 'idle'|'parsing'|'awaiting_restaurant'|'uploading'|'success'|'error'
interface FileResult {
  name:string; status:UploadStatus; reportType?:ReportType; restaurant?:string
  date?:string; rows?:number; error?:string; buffer?:ArrayBuffer; parsedRows?:any[]
}

export default function UploadPage() {
  const supabase = createClient()
  const [files, setFiles] = useState<FileResult[]>([])
  const [dragging, setDragging] = useState(false)
  const [restaurants, setRestaurants] = useState<string[]>([])
  const [selectedRestaurants, setSelectedRestaurants] = useState<Record<number,string>>({})
  const [selectedDates, setSelectedDates] = useState<Record<number,string>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('restaurants').select('name').eq('active',true).order('name')
      .then(({data})=>setRestaurants(data?.map((r:any)=>r.name)??[]))
  }, [])

  async function processFiles(fileList: FileList) {
    const newFiles: FileResult[] = Array.from(fileList).map(f=>({name:f.name,status:'parsing' as UploadStatus}))
    setFiles(prev=>[...newFiles,...prev])
    for (let i=0; i<fileList.length; i++) {
      const file = fileList[i]
      try {
        const buffer = await file.arrayBuffer()
        const parsed = parseExcelFile(buffer, file.name)
        if (parsed.error) { setFiles(prev=>prev.map((f,j)=>j===i?{...f,status:'error',error:parsed.error}:f)); continue }
        if (parsed.reportType==='inventory') {
          setFiles(prev=>prev.map((f,j)=>j===i?{...f,status:'awaiting_restaurant',reportType:parsed.reportType,restaurant:'',date:parsed.date,rows:parsed.rows.length,buffer,parsedRows:parsed.rows}:f))
          continue
        }
        await uploadRows(i,parsed.reportType,parsed.restaurantName,parsed.date,parsed.rows,file.name)
      } catch(e:any) { setFiles(prev=>prev.map((f,j)=>j===i?{...f,status:'error',error:e.message}:f)) }
    }
  }

  async function uploadRows(idx:number,reportType:ReportType,restaurant:string,date:string,rows:any[],fileName?:string) {
    setFiles(prev=>prev.map((f,j)=>j===idx?{...f,status:'uploading',restaurant,date,rows:rows.length,reportType}:f))
    try {
      const {data:{user}} = await supabase.auth.getUser()
      const rowsWithUser = rows.map(r=>({...r,restaurant_name:restaurant,uploaded_by:user?.id}))
      const table = REPORT_TABLES[reportType]
      for (let b=0; b<rowsWithUser.length; b+=500) {
        const {error} = await supabase.from(table).insert(rowsWithUser.slice(b,b+500))
        if (error) throw new Error(error.message)
      }
      await supabase.from('upload_log').insert({file_name:fileName??'',report_type:reportType,restaurant_name:restaurant,date,rows_inserted:rows.length,uploaded_by:(await supabase.auth.getUser()).data.user?.id})
      setFiles(prev=>prev.map((f,j)=>j===idx?{...f,status:'success'}:f))
    } catch(e:any) { setFiles(prev=>prev.map((f,j)=>j===idx?{...f,status:'error',error:e.message}:f)) }
  }

  async function confirmInventory(idx:number) {
    const restaurant=selectedRestaurants[idx], date=selectedDates[idx]
    if(!restaurant||!date) return
    const file=files[idx]
    if(!file.parsedRows) return
    const rows=file.parsedRows.map(r=>({...r,restaurant_name:restaurant,date}))
    await uploadRows(idx,'inventory',restaurant,date,rows,file.name)
  }

  const statusColor=(s:UploadStatus)=>({
    idle:'#252d40', parsing:'#4f8ef730', awaiting_restaurant:'#f59e0b20',
    uploading:'#4f8ef730', success:'#22c55e20', error:'#ef444420'
  }[s])
  const statusBorder=(s:UploadStatus)=>({
    idle:'#252d40', parsing:'#4f8ef750', awaiting_restaurant:'#f59e0b50',
    uploading:'#4f8ef750', success:'#22c55e50', error:'#ef444450'
  }[s])

  return (
    <div style={{maxWidth:720, display:'flex', flexDirection:'column', gap:20}}>
      <div>
        <h1 style={{fontSize:20,fontWeight:800,color:C.text,letterSpacing:'-0.02em'}}>Upload Reports</h1>
        <p style={{fontSize:12,color:C.muted,marginTop:4}}>Upload daily Excel reports — auto-detected and stored by restaurant and date.</p>
      </div>

      {/* Type pills */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {(['hourly_sales','delivery_sales','meal_count','menu_mix','inventory'] as ReportType[]).map(t=>(
          <span key={t} style={{...badge('#4f8ef7'),fontSize:11}}>{REPORT_LABELS[t]}</span>
        ))}
      </div>

      {/* Drop zone */}
      <div onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files.length)processFiles(e.dataTransfer.files)}}
        onClick={()=>inputRef.current?.click()}
        style={{
          border:`2px dashed ${dragging?C.accent:C.border}`,
          borderRadius:16, padding:'48px 32px', textAlign:'center',
          background:dragging?C.accentG:'transparent', cursor:'pointer', transition:'all 0.2s'
        }}>
        <div style={{width:52,height:52,borderRadius:14,background:C.accentG,border:`1px solid ${C.accent}40`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
          <svg width="24" height="24" fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>
          </svg>
        </div>
        <p style={{fontSize:14,fontWeight:700,color:C.text}}>Drop Excel files here</p>
        <p style={{fontSize:12,color:C.muted,marginTop:4}}>or click to browse — supports multiple files at once</p>
        <input ref={inputRef} type="file" multiple accept=".xlsx,.xls" style={{display:'none'}} onChange={e=>e.target.files&&processFiles(e.target.files)}/>
      </div>

      {/* Results */}
      {files.length>0 && (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <p style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:'0.06em'}}>UPLOAD RESULTS</p>
          {files.map((f,i)=>(
            <div key={i} style={{background:statusColor(f.status),border:`1px solid ${statusBorder(f.status)}`,borderRadius:12,padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                {/* Status dot */}
                {f.status==='uploading'||f.status==='parsing'
                  ? <div style={{width:10,height:10,border:`2px solid ${C.accent}`,borderTopColor:'transparent',borderRadius:'50%',flexShrink:0,animation:'spin 0.8s linear infinite'}}/>
                  : <div style={{width:10,height:10,borderRadius:'50%',flexShrink:0,background:{idle:'#252d40',awaiting_restaurant:C.amber,success:C.green,error:C.red}[f.status]||C.accent}}/>}
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:12,fontWeight:600,color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</p>
                  {f.restaurant&&f.status!=='awaiting_restaurant'&&<p style={{fontSize:10,color:C.muted,marginTop:2}}>{f.restaurant} · {f.date} · {f.rows} rows</p>}
                  {f.status==='success'&&<p style={{fontSize:10,color:C.green,marginTop:2}}>✓ Uploaded successfully</p>}
                  {f.error&&<p style={{fontSize:10,color:C.red,marginTop:2}}>{f.error}</p>}
                </div>
                {f.reportType&&<span style={{...badge(C.accent),fontSize:10}}>{REPORT_LABELS[f.reportType]}</span>}
              </div>
              {f.status==='awaiting_restaurant'&&(
                <div style={{paddingLeft:22,display:'flex',flexDirection:'column',gap:10}}>
                  <div>
                    <label style={{display:'block',fontSize:10,fontWeight:700,color:C.amber,letterSpacing:'0.06em',marginBottom:6}}>WHICH RESTAURANT?</label>
                    <select value={selectedRestaurants[i]??''} onChange={e=>setSelectedRestaurants(p=>({...p,[i]:e.target.value}))}
                      style={{...selectStyle,width:'100%',borderColor:'#f59e0b50'}}>
                      <option value="">Select restaurant…</option>
                      {restaurants.map(r=><option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:10,fontWeight:700,color:C.amber,letterSpacing:'0.06em',marginBottom:6}}>REPORT DATE</label>
                    <input type="date" value={selectedDates[i]??''} onChange={e=>setSelectedDates(p=>({...p,[i]:e.target.value}))}
                      style={{...inputStyle,width:'100%',borderColor:'#f59e0b50'}}/>
                  </div>
                  <button onClick={()=>confirmInventory(i)} disabled={!selectedRestaurants[i]||!selectedDates[i]}
                    style={{...btnPrimary,background:C.amber,opacity:(!selectedRestaurants[i]||!selectedDates[i])?0.4:1,width:'fit-content'}}>
                    Upload
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
