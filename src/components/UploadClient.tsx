'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { parseExcelFile, REPORT_LABELS, REPORT_TABLES, type ReportType } from '@/lib/excel-parser'
import { C, btnPrimary, inputStyle, selectStyle, badge } from '@/lib/ds'

type UploadStatus = 'idle'|'parsing'|'awaiting_restaurant'|'uploading'|'success'|'error'

interface FileResult {
  id: string           // stable unique ID — never changes
  name: string
  status: UploadStatus
  reportType?: ReportType
  restaurant?: string
  date?: string
  rows?: number
  error?: string
  parsedRows?: any[]
  // For awaiting_restaurant state
  selectedRestaurant: string
  selectedDate: string
}

let idCounter = 0
function newId() { return `f_${++idCounter}_${Date.now()}` }

export default function UploadPage() {
  const supabase = createClient()
  const [files, setFiles] = useState<FileResult[]>([])
  const [dragging, setDragging] = useState(false)
  const [restaurants, setRestaurants] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('restaurants').select('name').eq('active',true).order('name')
      .then(({data})=>setRestaurants(data?.map((r:any)=>r.name)??[]))
  }, [])

  // Update a file by its stable ID
  function updateFile(id: string, patch: Partial<FileResult>) {
    setFiles(prev => prev.map(f => f.id === id ? {...f, ...patch} : f))
  }

  async function processFiles(fileList: FileList) {
    // Create entries with stable IDs first
    const entries: FileResult[] = Array.from(fileList).map(f => ({
      id: newId(), name: f.name, status: 'parsing',
      selectedRestaurant: '', selectedDate: '',
    }))
    // Prepend to list
    setFiles(prev => [...entries, ...prev])

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      const id = entries[i].id   // use stable ID, not array index
      try {
        const buffer = await file.arrayBuffer()
        const parsed = parseExcelFile(buffer, file.name)

        if (parsed.error) {
          updateFile(id, { status:'error', error: parsed.error })
          continue
        }

        if (parsed.reportType === 'inventory') {
          // Show restaurant + date pickers — store parsedRows with stable id
          updateFile(id, {
            status: 'awaiting_restaurant',
            reportType: 'inventory',
            rows: parsed.rows.length,
            parsedRows: parsed.rows,
          })
          continue
        }

        // Auto-upload non-inventory reports
        await uploadRows(id, parsed.reportType, parsed.restaurantName, parsed.date, parsed.rows, file.name)
      } catch(e:any) {
        updateFile(id, { status:'error', error: e.message })
      }
    }
  }

  async function uploadRows(
    id: string, reportType: ReportType,
    restaurant: string, date: string,
    rows: any[], fileName?: string
  ) {
    updateFile(id, { status:'uploading', restaurant, date, rows: rows.length, reportType })
    try {
      const { data:{ user } } = await supabase.auth.getUser()

      // Delete existing data for this restaurant+date to avoid duplicates
      await supabase.from(REPORT_TABLES[reportType])
        .delete()
        .eq('restaurant_name', restaurant)
        .eq('date', date)

      const rowsWithUser = rows.map(r => ({
        ...r,
        restaurant_name: restaurant,
        date: date,
        uploaded_by: user?.id,
      }))

      const table = REPORT_TABLES[reportType]
      for (let b = 0; b < rowsWithUser.length; b += 500) {
        const { error } = await supabase.from(table).insert(rowsWithUser.slice(b, b+500))
        if (error) throw new Error(error.message)
      }

      await supabase.from('upload_log').insert({
        file_name: fileName ?? '',
        report_type: reportType,
        restaurant_name: restaurant,
        date,
        rows_inserted: rows.length,
        uploaded_by: user?.id,
      })

      updateFile(id, { status:'success' })
    } catch(e:any) {
      updateFile(id, { status:'error', error: e.message })
    }
  }

  async function confirmInventory(id: string) {
    const file = files.find(f => f.id === id)
    if (!file?.parsedRows) return
    const restaurant = file.selectedRestaurant
    const date = file.selectedDate
    if (!restaurant || !date) return

    // Override restaurant_name and date on every parsed row
    const rows = file.parsedRows.map(r => ({
      ...r,
      restaurant_name: restaurant,
      date: date,
    }))
    await uploadRows(id, 'inventory', restaurant, date, rows, file.name)
  }

  const statusColor = (s: UploadStatus) => ({
    idle:'#252d40', parsing:'#4f8ef730', awaiting_restaurant:'#f59e0b20',
    uploading:'#4f8ef730', success:'#22c55e20', error:'#ef444420'
  }[s] || '#252d40')

  const statusBorder = (s: UploadStatus) => ({
    idle:'#252d40', parsing:'#4f8ef750', awaiting_restaurant:'#f59e0b50',
    uploading:'#4f8ef750', success:'#22c55e50', error:'#ef444450'
  }[s] || '#252d40')

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
      <div
        onDragOver={e=>{e.preventDefault();setDragging(true)}}
        onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files.length)processFiles(e.dataTransfer.files)}}
        onClick={()=>inputRef.current?.click()}
        style={{
          border:`2px dashed ${dragging?C.accent:C.border}`,
          borderRadius:16, padding:'48px 32px', textAlign:'center',
          background:dragging?C.accentG:'transparent', cursor:'pointer', transition:'all 0.2s'
        }}>
        <div style={{width:52,height:52,borderRadius:14,background:C.accentG,border:`1px solid ${C.accent}40`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
          <svg width="24" height="24" fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <polyline points="9 15 12 12 15 15"/>
          </svg>
        </div>
        <p style={{fontSize:14,fontWeight:700,color:C.text}}>Drop Excel files here</p>
        <p style={{fontSize:12,color:C.muted,marginTop:4}}>or click to browse — supports multiple files at once</p>
        <input ref={inputRef} type="file" multiple accept=".xlsx,.xls" style={{display:'none'}}
          onChange={e=>e.target.files&&processFiles(e.target.files)}/>
      </div>

      {/* Results */}
      {files.length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <p style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:'0.06em'}}>UPLOAD RESULTS</p>
            <button onClick={()=>setFiles([])} style={{fontSize:11,color:C.dim,background:'transparent',border:'none',cursor:'pointer'}}>
              Clear all
            </button>
          </div>

          {files.map(f => (
            <div key={f.id} style={{
              background:statusColor(f.status),
              border:`1px solid ${statusBorder(f.status)}`,
              borderRadius:12,padding:'14px 16px',
              display:'flex',flexDirection:'column',gap:10
            }}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                {/* Status indicator */}
                {f.status==='uploading'||f.status==='parsing'
                  ? <div style={{width:10,height:10,border:`2px solid ${C.accent}`,borderTopColor:'transparent',borderRadius:'50%',flexShrink:0,animation:'spin 0.8s linear infinite'}}/>
                  : <div style={{width:10,height:10,borderRadius:'50%',flexShrink:0,background:
                      f.status==='awaiting_restaurant'?C.amber:
                      f.status==='success'?C.green:
                      f.status==='error'?C.red:C.accent
                    }}/>
                }
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:12,fontWeight:600,color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</p>
                  {f.restaurant && f.status!=='awaiting_restaurant' &&
                    <p style={{fontSize:10,color:C.muted,marginTop:2}}>
                      {f.restaurant.split(' - ')[2]||f.restaurant} · {f.date} · {f.rows} rows
                    </p>}
                  {f.status==='success' && <p style={{fontSize:10,color:C.green,marginTop:2}}>✓ Uploaded successfully — {f.rows} rows stored</p>}
                  {f.status==='awaiting_restaurant' && <p style={{fontSize:10,color:C.amber,marginTop:2}}>⚠ Select restaurant and date to upload</p>}
                  {f.error && <p style={{fontSize:10,color:C.red,marginTop:2}}>{f.error}</p>}
                </div>
                {f.reportType && <span style={{...badge(C.accent),fontSize:10}}>{REPORT_LABELS[f.reportType]}</span>}
              </div>

              {/* Inventory: restaurant + date picker */}
              {f.status==='awaiting_restaurant' && (
                <div style={{paddingLeft:22,display:'flex',flexDirection:'column',gap:10}}>
                  <p style={{fontSize:11,color:C.amber,fontWeight:600}}>
                    {f.rows} items ready — select restaurant and date:
                  </p>
                  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                    <div style={{flex:1,minWidth:200}}>
                      <label style={{display:'block',fontSize:10,fontWeight:700,color:C.amber,letterSpacing:'0.06em',marginBottom:6}}>RESTAURANT</label>
                      <select
                        value={f.selectedRestaurant}
                        onChange={e => updateFile(f.id, {selectedRestaurant: e.target.value})}
                        style={{...selectStyle,width:'100%',borderColor:'#f59e0b50'}}>
                        <option value="">Select restaurant…</option>
                        {restaurants.map(r=><option key={r} value={r}>{r.split(' - ')[2]||r}</option>)}
                      </select>
                    </div>
                    <div style={{flex:1,minWidth:160}}>
                      <label style={{display:'block',fontSize:10,fontWeight:700,color:C.amber,letterSpacing:'0.06em',marginBottom:6}}>REPORT DATE</label>
                      <input
                        type="date"
                        value={f.selectedDate}
                        onChange={e => updateFile(f.id, {selectedDate: e.target.value})}
                        style={{...inputStyle,width:'100%',borderColor:'#f59e0b50'}}/>
                    </div>
                  </div>
                  <button
                    onClick={()=>confirmInventory(f.id)}
                    disabled={!f.selectedRestaurant || !f.selectedDate}
                    style={{
                      ...btnPrimary, background:C.amber,
                      opacity:(!f.selectedRestaurant||!f.selectedDate)?0.4:1,
                      width:'fit-content'
                    }}>
                    Upload {f.rows} rows
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
