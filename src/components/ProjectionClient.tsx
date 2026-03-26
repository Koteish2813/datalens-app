'use client'
import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { createClient } from '@/lib/supabase'
import * as XLSX from 'xlsx'

const C = {
  bg:'#0f1117', surface:'#161b27', card:'#1a2035', border:'#252d40',
  text:'#f1f5f9', muted:'#8892a4', dim:'#4a5568',
  accent:'#4f8ef7', accentG:'rgba(79,142,247,0.12)', green:'#22c55e', amber:'#f59e0b', red:'#ef4444', purple:'#a78bfa',
}
const fmt = (n:number, d=2) => Number(n||0).toLocaleString('en',{minimumFractionDigits:d,maximumFractionDigits:d})
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const HOURS = Array.from({length:24},(_,i)=>`${String(i).padStart(2,'0')}:00`)

function getDayName(dateStr:string) { return DAYS[new Date(dateStr).getDay()] }
function isWeekend(dateStr:string) { const d=new Date(dateStr).getDay(); return d===5||d===6 } // Fri/Sat

// ── Shared UI ──────────────────────────────────────────────────────────────
const cardStyle:CSSProperties = {background:C.card,borderRadius:14,border:`1px solid ${C.border}`,padding:20}
const labelStyle:CSSProperties = {display:'block',fontSize:10,fontWeight:700,color:C.dim,letterSpacing:'0.08em',marginBottom:6}
const inputStyle:CSSProperties = {background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'8px 12px',fontSize:13,width:'100%',fontFamily:'inherit'}
const btnStyle:CSSProperties = {background:C.accent,color:'white',border:'none',borderRadius:8,padding:'9px 18px',fontSize:13,fontWeight:700,cursor:'pointer'}
const btnGhost:CSSProperties = {background:'transparent',color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 14px',fontSize:12,fontWeight:500,cursor:'pointer'}

function SectionDivider({label}:{label:string}) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:12,margin:'20px 0 12px'}}>
      <div style={{height:1,flex:1,background:`linear-gradient(to right,${C.border},transparent)`}}/>
      <span style={{fontSize:9,fontWeight:800,color:C.dim,letterSpacing:'0.12em'}}>{label}</span>
      <div style={{height:1,flex:1,background:`linear-gradient(to left,${C.border},transparent)`}}/>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function ProjectionClient() {
  const supabase = createClient()
  const [tab, setTab] = useState<'projection'|'upt'|'ordering'>('projection')
  const [restaurants, setRestaurants] = useState<string[]>([])
  const [selectedRest, setSelectedRest] = useState('all')

  // Baseline inputs
  const [baseFrom, setBaseFrom] = useState('')
  const [baseTo, setBaseTo]     = useState('')
  const [projDays, setProjDays] = useState(14)
  const [loading, setLoading]   = useState(false)

  // Computed data
  const [hourlySales, setHourlySales]   = useState<any[]>([])
  const [inventoryData, setInventoryData] = useState<any[]>([])
  const [masterItems, setMasterItems]   = useState<any[]>([])
  const [dataLoaded, setDataLoaded]     = useState(false)

  useEffect(() => {
    supabase.from('restaurants').select('name').eq('active',true).order('name')
      .then(({data}) => setRestaurants(data?.map((r:any)=>r.name)??[]))
    supabase.from('master_items').select('item_code,item_name,unit,category,supplier,correct_price,qty_per_cs,price_per_cs')
      .then(({data}) => setMasterItems(data??[]))
  }, [])

  async function loadData() {
    if (!baseFrom || !baseTo) return
    setLoading(true)
    let hq = supabase.from('hourly_sales').select('restaurant_name,date,hour,no_of_tickets,net_sales,subtotal').gte('date',baseFrom).lte('date',baseTo)
    let iq = supabase.from('inventory').select('restaurant_name,date,item_code,item_name,unit,consumption,average_price').gte('date',baseFrom).lte('date',baseTo)
    if (selectedRest !== 'all') { hq = hq.eq('restaurant_name',selectedRest); iq = iq.eq('restaurant_name',selectedRest) }
    const [hr, ir] = await Promise.all([hq, iq])
    setHourlySales(hr.data??[])
    setInventoryData(ir.data??[])
    setDataLoaded(true)
    setLoading(false)
  }

  // ── Derived: daily aggregates ──────────────────────────────────────────
  const dailyMap: Record<string,{sales:number;txn:number;dates:string[]}> = {}
  hourlySales.forEach(r => {
    if (!dailyMap[r.date]) dailyMap[r.date] = {sales:0,txn:0,dates:[r.date]}
    dailyMap[r.date].sales += r.net_sales||0
    dailyMap[r.date].txn   += r.no_of_tickets||0
  })
  const dailyRows = Object.entries(dailyMap).map(([date,v])=>({date,...v})).sort((a,b)=>a.date.localeCompare(b.date))

  // Averages
  const totalDays  = dailyRows.length || 1
  const avgSales   = dailyRows.reduce((s,r)=>s+r.sales,0) / totalDays
  const avgTxn     = dailyRows.reduce((s,r)=>s+r.txn,0)   / totalDays

  // By weekday averages
  const byDayMap: Record<number,{sales:number;txn:number;count:number}> = {}
  dailyRows.forEach(r => {
    const d = new Date(r.date).getDay()
    if (!byDayMap[d]) byDayMap[d] = {sales:0,txn:0,count:0}
    byDayMap[d].sales += r.sales; byDayMap[d].txn += r.txn; byDayMap[d].count++
  })

  // Hourly pattern (% of daily total per hour)
  const hourlyDailyTotals: Record<string,{sales:number;txn:number}> = {}
  const hourlyTotals: Record<string,{sales:number;txn:number}> = {}
  hourlySales.forEach(r => {
    if (!hourlyDailyTotals[r.date]) hourlyDailyTotals[r.date]={sales:0,txn:0}
    hourlyDailyTotals[r.date].sales += r.net_sales||0
    hourlyDailyTotals[r.date].txn   += r.no_of_tickets||0
    const h = (r.hour||'').substring(0,5)
    if (!hourlyTotals[h]) hourlyTotals[h]={sales:0,txn:0}
    hourlyTotals[h].sales += r.net_sales||0
    hourlyTotals[h].txn   += r.no_of_tickets||0
  })
  const totalSales = Object.values(hourlyDailyTotals).reduce((s,v)=>s+v.sales,0) || 1
  const totalTxn   = Object.values(hourlyDailyTotals).reduce((s,v)=>s+v.txn,0)   || 1
  const hourlyPct: Record<string,{salesPct:number;txnPct:number}> = {}
  Object.entries(hourlyTotals).forEach(([h,v]) => {
    hourlyPct[h] = {salesPct:v.sales/totalSales, txnPct:v.txn/totalTxn}
  })

  // ── Generate projected dates ───────────────────────────────────────────
  const projectedDates: string[] = []
  if (baseTo) {
    const start = new Date(baseTo)
    start.setDate(start.getDate()+1)
    for (let i=0; i<projDays; i++) {
      const d = new Date(start); d.setDate(start.getDate()+i)
      projectedDates.push(d.toISOString().split('T')[0])
    }
  }

  function projectDay(dateStr:string) {
    const dow = new Date(dateStr).getDay()
    const base = byDayMap[dow]
    if (base && base.count > 0) return {sales: base.sales/base.count, txn: base.txn/base.count}
    return {sales: avgSales, txn: avgTxn}
  }

  // Week-to-week: group existing days by week
  const weeks: Record<number,typeof dailyRows> = {}
  dailyRows.forEach(r => {
    const d = new Date(r.date)
    const startOfYear = new Date(d.getFullYear(),0,1)
    const weekNum = Math.ceil(((d.getTime()-startOfYear.getTime())/86400000 + startOfYear.getDay()+1)/7)
    if (!weeks[weekNum]) weeks[weekNum] = []
    weeks[weekNum].push(r)
  })
  const weekNums = Object.keys(weeks).map(Number).sort()

  // ── UPT Calculations ──────────────────────────────────────────────────
  const totalTxnBaseline = dailyRows.reduce((s,r)=>s+r.txn,0) || 1
  const totalSalesBaseline = dailyRows.reduce((s,r)=>s+r.sales,0) || 1

  const consMap: Record<string,{name:string;unit:string;qty:number;val:number}> = {}
  inventoryData.forEach(r => {
    const k = r.item_code
    if (!consMap[k]) consMap[k]={name:r.item_name||'',unit:r.unit||'',qty:0,val:0}
    consMap[k].qty += r.consumption||0
    consMap[k].val += (r.consumption||0)*(r.average_price||0)
  })
  const uptRows = Object.entries(consMap).map(([code,v]) => ({
    code, name:v.name, unit:v.unit, totalQty:v.qty, totalVal:v.val,
    uptTxn:  totalTxnBaseline   > 0 ? (v.qty / totalTxnBaseline   * 1000) : 0,
    uptSales: totalSalesBaseline > 0 ? (v.qty / totalSalesBaseline * 1000) : 0,
  })).filter(r=>r.totalQty>0).sort((a,b)=>b.totalVal-a.totalVal)

  // ── Ordering Calculation ───────────────────────────────────────────────
  const projTotalTxn   = projectedDates.reduce((s,d)=>s+projectDay(d).txn,0)
  const projTotalSales = projectedDates.reduce((s,d)=>s+projectDay(d).sales,0)

  const orderRows = uptRows.map(r => {
    const master = masterItems.find(m=>m.item_code===r.code)
    const projQty = r.uptTxn * projTotalTxn / 1000
    const projVal = projQty * (master?.correct_price||0)
    const csQty   = master?.qty_per_cs ? Math.ceil(projQty / master.qty_per_cs) : null
    return {...r, master, projQty, projVal, csQty,
      supplier: master?.supplier||'—',
      price_per_cs: master?.price_per_cs||0,
      orderVal: csQty ? csQty*(master?.price_per_cs||0) : projVal
    }
  })

  // Per restaurant ordering
  const restConsMap: Record<string, typeof consMap> = {}
  inventoryData.forEach(r => {
    if (!restConsMap[r.restaurant_name]) restConsMap[r.restaurant_name] = {}
    const rc = restConsMap[r.restaurant_name]
    const k = r.item_code
    if (!rc[k]) rc[k]={name:r.item_name||'',unit:r.unit||'',qty:0,val:0}
    rc[k].qty += r.consumption||0; rc[k].val += (r.consumption||0)*(r.average_price||0)
  })
  const restTxnMap: Record<string,number> = {}
  hourlySales.forEach(r => { restTxnMap[r.restaurant_name]=(restTxnMap[r.restaurant_name]||0)+(r.no_of_tickets||0) })

  function exportOrder() {
    const wb = XLSX.utils.book_new()
    // Combined sheet
    const combined = [
      ['Item Code','Item Name','Unit','Supplier','Projected Qty','CS Qty','Price/CS (KWD)','Order Value (KWD)','UPT/1000 Txn']
    ].concat(orderRows.map(r=>[r.code,r.name,r.unit,r.supplier,+r.projQty.toFixed(3),r.csQty??'N/A',+r.price_per_cs.toFixed(3),+r.orderVal.toFixed(3),+r.uptTxn.toFixed(4)]))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(combined), 'Combined Order')
    // Per restaurant sheets
    Object.entries(restConsMap).forEach(([rest, rc]) => {
      const restTxn = restTxnMap[rest]||1
      const rows = [['Item Code','Item Name','Unit','Supplier','Projected Qty','CS Qty','Price/CS','Order Value']]
      Object.entries(rc).filter(([,v])=>v.qty>0).forEach(([code,v])=>{
        const master = masterItems.find(m=>m.item_code===code)
        const restProjTxn = projTotalTxn * (restTxn / totalTxnBaseline)
        const upt = v.qty / restTxn * 1000
        const projQty = upt * restProjTxn / 1000
        const csQty = master?.qty_per_cs ? Math.ceil(projQty/master.qty_per_cs) : null
        const orderVal = csQty ? csQty*(master?.price_per_cs||0) : projQty*(master?.correct_price||0)
        rows.push([code,v.name,v.unit,master?.supplier||'—',+projQty.toFixed(3),csQty??'N/A',+(master?.price_per_cs||0).toFixed(3),+orderVal.toFixed(3)])
      })
      const shortName = rest.split(' - ')[2]?.substring(0,20)||rest.substring(0,20)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), shortName)
    })
    XLSX.writeFile(wb, `Order_Projection_${baseFrom}_to_${baseTo}_+${projDays}days.xlsx`)
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{color:C.text,fontFamily:'"DM Sans",-apple-system,sans-serif'}}>
      {/* Header */}
      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:20,fontWeight:800,color:C.text,letterSpacing:'-0.02em',margin:0}}>Projection & Ordering</h1>
        <p style={{fontSize:12,color:C.muted,marginTop:4}}>Project future sales from historical baseline · Calculate UPT · Generate purchase orders</p>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,background:C.card,padding:4,borderRadius:12,width:'fit-content',marginBottom:20}}>
        {([['projection','📈 Sales Projection'],['upt','📊 UPT Analysis'],['ordering','📦 Ordering']] as const).map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)} style={{
            fontSize:12,fontWeight:600,padding:'7px 16px',borderRadius:8,border:'none',cursor:'pointer',
            background: tab===key ? C.accent : 'transparent',
            color: tab===key ? 'white' : C.muted,
            transition:'all 0.15s'
          }}>{label}</button>
        ))}
      </div>

      {/* Inputs */}
      <div style={{...cardStyle,marginBottom:20}}>
        <div style={{display:'flex',flexWrap:'wrap',gap:16,alignItems:'flex-end'}}>
          <div style={{flex:1,minWidth:140}}>
            <label style={labelStyle}>BASELINE FROM</label>
            <input type="date" value={baseFrom} onChange={e=>setBaseFrom(e.target.value)} style={inputStyle}/>
          </div>
          <div style={{flex:1,minWidth:140}}>
            <label style={labelStyle}>BASELINE TO</label>
            <input type="date" value={baseTo} onChange={e=>setBaseTo(e.target.value)} style={inputStyle}/>
          </div>
          <div style={{flex:1,minWidth:120}}>
            <label style={labelStyle}>PROJECT FORWARD (DAYS)</label>
            <input type="number" min={1} max={365} value={projDays} onChange={e=>setProjDays(parseInt(e.target.value)||14)} style={inputStyle}/>
          </div>
          <div style={{flex:1,minWidth:180}}>
            <label style={labelStyle}>LOCATION</label>
            <select value={selectedRest} onChange={e=>setSelectedRest(e.target.value)} style={inputStyle}>
              <option value="all">All Restaurants</option>
              {restaurants.map(r=><option key={r} value={r}>{r.split(' - ')[2]||r}</option>)}
            </select>
          </div>
          <button onClick={loadData} disabled={!baseFrom||!baseTo||loading} style={{
            ...btnStyle, opacity:(!baseFrom||!baseTo)?0.4:1,
            display:'flex',alignItems:'center',gap:8
          }}>
            {loading && <div style={{width:12,height:12,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>}
            {loading ? 'Loading…' : 'Load & Project'}
          </button>
        </div>
        {dataLoaded && (
          <div style={{display:'flex',gap:16,marginTop:12,flexWrap:'wrap'}}>
            <span style={{fontSize:11,color:C.green,fontWeight:600}}>✓ {dailyRows.length} baseline days loaded</span>
            <span style={{fontSize:11,color:C.green,fontWeight:600}}>✓ {projectedDates.length} days projected</span>
            <span style={{fontSize:11,color:C.green,fontWeight:600}}>✓ {uptRows.length} ingredients tracked</span>
            <span style={{fontSize:11,color:C.muted}}>Avg daily sales: KWD {fmt(avgSales)} · Avg txn: {fmt(avgTxn,0)}</span>
          </div>
        )}
      </div>

      {!dataLoaded && (
        <div style={{...cardStyle,textAlign:'center',padding:'48px 20px'}}>
          <div style={{fontSize:36,marginBottom:12}}>📈</div>
          <p style={{fontSize:14,fontWeight:700,color:C.text,margin:'0 0 6px'}}>Select a baseline date range and click Load & Project</p>
          <p style={{fontSize:12,color:C.muted}}>Historical data will be used to project future sales, calculate UPT, and generate purchase orders</p>
        </div>
      )}

      {/* ── TAB 1: SALES PROJECTION ── */}
      {dataLoaded && tab==='projection' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>

          {/* KPI Summary */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
            {[
              {label:'PROJECTED TOTAL SALES',  value:`KWD ${fmt(projectedDates.reduce((s,d)=>s+projectDay(d).sales,0))}`, color:C.accent},
              {label:'PROJECTED TRANSACTIONS',  value:fmt(projectedDates.reduce((s,d)=>s+projectDay(d).txn,0),0),         color:C.green},
              {label:'BASELINE AVG DAILY SALES',value:`KWD ${fmt(avgSales)}`,                                              color:C.amber},
              {label:'BASELINE AVG DAILY TXN',  value:fmt(avgTxn,0),                                                       color:C.purple},
            ].map((k,i)=>(
              <div key={i} style={{...cardStyle,padding:'16px 18px'}}>
                <p style={{fontSize:9,fontWeight:700,color:C.dim,letterSpacing:'0.08em',margin:'0 0 8px'}}>{k.label}</p>
                <p style={{fontSize:20,fontWeight:800,color:k.color,fontFamily:'monospace',margin:0}}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Projected Days Table */}
          <SectionDivider label="DAILY PROJECTION"/>
          <div style={{...cardStyle,padding:0,overflow:'hidden'}}>
            <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <p style={{fontSize:13,fontWeight:700,color:C.text,margin:0}}>Day-by-Day Projection — Next {projDays} Days</p>
              <span style={{fontSize:11,color:C.muted}}>Based on same-weekday averages from baseline</span>
            </div>
            <div style={{overflowX:'auto',maxHeight:400}}>
              <table style={{width:'100%',fontSize:12,borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:`${C.border}40`}}>
                    {['Date','Day','Type','Proj. Sales (KWD)','Proj. Txn','APT (KWD)'].map(h=>(
                      <th key={h} style={{padding:'10px 14px',color:C.dim,fontWeight:700,fontSize:10,letterSpacing:'0.07em',textAlign:'left',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projectedDates.map((date,i)=>{
                    const {sales,txn} = projectDay(date)
                    const dow = getDayName(date)
                    const wknd = isWeekend(date)
                    return (
                      <tr key={i} style={{borderTop:`1px solid ${C.border}30`,background:i%2===0?'transparent':`${C.border}20`}}>
                        <td style={{padding:'9px 14px',color:C.text,fontFamily:'monospace'}}>{date}</td>
                        <td style={{padding:'9px 14px',color:C.text,fontWeight:600}}>{dow}</td>
                        <td style={{padding:'9px 14px'}}>
                          <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,
                            background:wknd?`${C.amber}20`:C.accentG,
                            color:wknd?C.amber:C.accent}}>
                            {wknd?'Weekend':'Weekday'}
                          </span>
                        </td>
                        <td style={{padding:'9px 14px',color:C.accent,fontFamily:'monospace',fontWeight:600}}>{fmt(sales)}</td>
                        <td style={{padding:'9px 14px',color:C.green,fontFamily:'monospace'}}>{fmt(txn,0)}</td>
                        <td style={{padding:'9px 14px',color:C.muted,fontFamily:'monospace'}}>{txn>0?fmt(sales/txn,3):'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Week-to-Week Comparable */}
          <SectionDivider label="WEEK-TO-WEEK COMPARABLE"/>
          <div style={{...cardStyle,padding:0,overflow:'hidden'}}>
            <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.border}`}}>
              <p style={{fontSize:13,fontWeight:700,color:C.text,margin:0}}>Same-Weekday Comparison Across Weeks</p>
              <p style={{fontSize:11,color:C.muted,marginTop:2}}>Sales per day — each column is one week</p>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',fontSize:11,borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:`${C.border}40`}}>
                    <th style={{padding:'9px 14px',color:C.dim,fontWeight:700,fontSize:10,textAlign:'left'}}>WEEKDAY</th>
                    {weekNums.map(wk=>(
                      <th key={wk} style={{padding:'9px 14px',color:C.dim,fontWeight:700,fontSize:10,textAlign:'right'}}>WEEK {wk}</th>
                    ))}
                    <th style={{padding:'9px 14px',color:C.dim,fontWeight:700,fontSize:10,textAlign:'right'}}>AVG</th>
                  </tr>
                </thead>
                <tbody>
                  {[1,2,3,4,5,6,0].map(dow=>{
                    const dayName = DAYS[dow]
                    const wkndDay = dow===5||dow===6
                    const vals = weekNums.map(wk=>{
                      const dayRow = (weeks[wk]||[]).find(r=>new Date(r.date).getDay()===dow)
                      return dayRow?.sales||null
                    })
                    const validVals = vals.filter(v=>v!==null) as number[]
                    const avg = validVals.length>0 ? validVals.reduce((s,v)=>s+v,0)/validVals.length : 0
                    return (
                      <tr key={dow} style={{borderTop:`1px solid ${C.border}30`,background:wkndDay?`${C.amber}08`:'transparent'}}>
                        <td style={{padding:'9px 14px',fontWeight:700,color:wkndDay?C.amber:C.text}}>
                          {dayName} {wkndDay&&<span style={{fontSize:9,color:C.amber}}>WKD</span>}
                        </td>
                        {vals.map((v,i)=>(
                          <td key={i} style={{padding:'9px 14px',textAlign:'right',fontFamily:'monospace',
                            color:v===null?C.dim:v>avg?C.green:v<avg?C.red:C.text}}>
                            {v===null?'—':fmt(v)}
                          </td>
                        ))}
                        <td style={{padding:'9px 14px',textAlign:'right',fontFamily:'monospace',color:C.accent,fontWeight:700}}>
                          {avg>0?fmt(avg):'—'}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Weekday vs Weekend summary */}
                  {[false,true].map(wknd=>{
                    const rows2 = dailyRows.filter(r=>isWeekend(r.date)===wknd)
                    const avgS = rows2.length>0?rows2.reduce((s,r)=>s+r.sales,0)/rows2.length:0
                    const avgT = rows2.length>0?rows2.reduce((s,r)=>s+r.txn,0)/rows2.length:0
                    return (
                      <tr key={String(wknd)} style={{borderTop:`2px solid ${C.border}`,background:`${wknd?C.amber:C.accent}10`}}>
                        <td style={{padding:'10px 14px',fontWeight:800,color:wknd?C.amber:C.accent,fontSize:11}}>
                          {wknd?'WEEKEND AVG':'WEEKDAY AVG'}
                        </td>
                        {weekNums.map(wk=>{
                          const wkRows = (weeks[wk]||[]).filter(r=>isWeekend(r.date)===wknd)
                          const avg2 = wkRows.length>0?wkRows.reduce((s,r)=>s+r.sales,0)/wkRows.length:null
                          return <td key={wk} style={{padding:'10px 14px',textAlign:'right',fontFamily:'monospace',color:C.muted}}>{avg2?fmt(avg2):'—'}</td>
                        })}
                        <td style={{padding:'10px 14px',textAlign:'right',fontFamily:'monospace',fontWeight:800,color:wknd?C.amber:C.accent}}>
                          KWD {fmt(avgS)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Hourly Projection */}
          <SectionDivider label="HOURLY PROJECTION"/>
          <div style={{...cardStyle,padding:0,overflow:'hidden'}}>
            <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.border}`}}>
              <p style={{fontSize:13,fontWeight:700,color:C.text,margin:0}}>Hourly Distribution — Projected Average Day</p>
              <p style={{fontSize:11,color:C.muted,marginTop:2}}>Based on historical hourly patterns from baseline</p>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',fontSize:11,borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{background:`${C.border}40`}}>
                    {['Hour','% of Day','Proj. Sales (KWD)','Proj. Txn'].map(h=>(
                      <th key={h} style={{padding:'8px 14px',color:C.dim,fontWeight:700,fontSize:10,textAlign:'left'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(hourlyPct).sort((a,b)=>a[0].localeCompare(b[0])).map(([hour,pct],i)=>(
                    <tr key={i} style={{borderTop:`1px solid ${C.border}30`}}>
                      <td style={{padding:'8px 14px',color:C.text,fontFamily:'monospace',fontWeight:600}}>{hour}</td>
                      <td style={{padding:'8px 14px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{flex:1,height:4,background:`${C.border}`,borderRadius:2,maxWidth:80}}>
                            <div style={{height:'100%',width:`${Math.min(pct.salesPct*100*5,100)}%`,background:C.accent,borderRadius:2}}/>
                          </div>
                          <span style={{color:C.muted,fontFamily:'monospace',fontSize:10}}>{(pct.salesPct*100).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td style={{padding:'8px 14px',color:C.accent,fontFamily:'monospace'}}>{fmt(avgSales*pct.salesPct)}</td>
                      <td style={{padding:'8px 14px',color:C.green,fontFamily:'monospace'}}>{fmt(avgTxn*pct.txnPct,0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: UPT ── */}
      {dataLoaded && tab==='upt' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
            {[
              {label:'TOTAL BASELINE TXN',   value:fmt(totalTxnBaseline,0),          color:C.accent},
              {label:'TOTAL BASELINE SALES',  value:`KWD ${fmt(totalSalesBaseline)}`,  color:C.green},
              {label:'INGREDIENTS TRACKED',   value:uptRows.length.toString(),          color:C.amber},
            ].map((k,i)=>(
              <div key={i} style={{...cardStyle,padding:'16px 18px'}}>
                <p style={{fontSize:9,fontWeight:700,color:C.dim,letterSpacing:'0.08em',margin:'0 0 8px'}}>{k.label}</p>
                <p style={{fontSize:20,fontWeight:800,color:k.color,fontFamily:'monospace',margin:0}}>{k.value}</p>
              </div>
            ))}
          </div>

          <div style={{...cardStyle,padding:0,overflow:'hidden'}}>
            <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <p style={{fontSize:13,fontWeight:700,color:C.text,margin:0}}>Usage Per 1,000 — UPT Analysis</p>
                <p style={{fontSize:11,color:C.muted,marginTop:2}}>Consumption per 1,000 transactions &amp; per 1,000 KWD sales</p>
              </div>
            </div>
            <div style={{overflowX:'auto',maxHeight:500}}>
              <table style={{width:'100%',fontSize:11,borderCollapse:'collapse'}}>
                <thead style={{position:'sticky',top:0}}>
                  <tr style={{background:C.surface}}>
                    {['Code','Item Name','Unit','Total Consumption','Total Value (KWD)','UPT / 1K Transactions','UPT / 1K KWD Sales'].map(h=>(
                      <th key={h} style={{padding:'9px 14px',color:C.dim,fontWeight:700,fontSize:9,letterSpacing:'0.07em',textAlign:'left',whiteSpace:'nowrap',borderBottom:`1px solid ${C.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uptRows.map((r,i)=>(
                    <tr key={i} style={{borderTop:`1px solid ${C.border}30`,background:i%2===0?'transparent':`${C.border}20`}}>
                      <td style={{padding:'8px 14px',color:C.muted,fontFamily:'monospace',fontSize:10}}>{r.code}</td>
                      <td style={{padding:'8px 14px',color:C.text,fontWeight:500,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</td>
                      <td style={{padding:'8px 14px',color:C.muted}}>{r.unit}</td>
                      <td style={{padding:'8px 14px',color:C.text,fontFamily:'monospace'}}>{fmt(r.totalQty,3)}</td>
                      <td style={{padding:'8px 14px',color:C.amber,fontFamily:'monospace'}}>{fmt(r.totalVal,3)}</td>
                      <td style={{padding:'8px 14px',color:C.accent,fontFamily:'monospace',fontWeight:700}}>{fmt(r.uptTxn,4)}</td>
                      <td style={{padding:'8px 14px',color:C.purple,fontFamily:'monospace'}}>{fmt(r.uptSales,4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: ORDERING ── */}
      {dataLoaded && tab==='ordering' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
            {[
              {label:'PROJECTED TXN',        value:fmt(projTotalTxn,0),                                             color:C.accent},
              {label:'PROJECTED SALES',       value:`KWD ${fmt(projTotalSales)}`,                                    color:C.green},
              {label:'TOTAL ORDER VALUE',     value:`KWD ${fmt(orderRows.reduce((s,r)=>s+r.orderVal,0))}`,          color:C.amber},
              {label:'ITEMS TO ORDER',        value:orderRows.filter(r=>r.projQty>0).length.toString(),              color:C.purple},
            ].map((k,i)=>(
              <div key={i} style={{...cardStyle,padding:'16px 18px'}}>
                <p style={{fontSize:9,fontWeight:700,color:C.dim,letterSpacing:'0.08em',margin:'0 0 8px'}}>{k.label}</p>
                <p style={{fontSize:20,fontWeight:800,color:k.color,fontFamily:'monospace',margin:0}}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Combined order */}
          <div style={{...cardStyle,padding:0,overflow:'hidden'}}>
            <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <p style={{fontSize:13,fontWeight:700,color:C.text,margin:0}}>Purchase Order — All Restaurants Combined</p>
                <p style={{fontSize:11,color:C.muted,marginTop:2}}>Projected {projDays} days · Based on UPT × projected transactions</p>
              </div>
              <button onClick={exportOrder} style={{...btnStyle,background:C.green,display:'flex',alignItems:'center',gap:6,fontSize:12}}>
                <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" viewBox="0 0 16 16"><path d="M8 1v10M5 8l3 3 3-3M2 13h12"/></svg>
                Export Excel
              </button>
            </div>
            <div style={{overflowX:'auto',maxHeight:500}}>
              <table style={{width:'100%',fontSize:11,borderCollapse:'collapse'}}>
                <thead style={{position:'sticky',top:0}}>
                  <tr style={{background:C.surface}}>
                    {['Code','Item Name','Unit','Supplier','UPT/1K Txn','Proj. Qty','CS Qty','Price/CS (KWD)','Order Value (KWD)'].map(h=>(
                      <th key={h} style={{padding:'9px 14px',color:C.dim,fontWeight:700,fontSize:9,letterSpacing:'0.07em',textAlign:'left',whiteSpace:'nowrap',borderBottom:`1px solid ${C.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderRows.map((r,i)=>(
                    <tr key={i} style={{borderTop:`1px solid ${C.border}30`,background:i%2===0?'transparent':`${C.border}20`}}>
                      <td style={{padding:'8px 14px',color:C.muted,fontFamily:'monospace',fontSize:10}}>{r.code}</td>
                      <td style={{padding:'8px 14px',color:C.text,fontWeight:500,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</td>
                      <td style={{padding:'8px 14px',color:C.muted}}>{r.unit}</td>
                      <td style={{padding:'8px 14px',color:C.muted,fontSize:10}}>{r.supplier}</td>
                      <td style={{padding:'8px 14px',color:C.accent,fontFamily:'monospace'}}>{fmt(r.uptTxn,4)}</td>
                      <td style={{padding:'8px 14px',color:C.text,fontFamily:'monospace',fontWeight:600}}>{fmt(r.projQty,3)}</td>
                      <td style={{padding:'8px 14px',color:C.amber,fontFamily:'monospace',fontWeight:700}}>{r.csQty??'—'}</td>
                      <td style={{padding:'8px 14px',color:C.muted,fontFamily:'monospace'}}>{r.price_per_cs?fmt(r.price_per_cs,3):'—'}</td>
                      <td style={{padding:'8px 14px',color:C.green,fontFamily:'monospace',fontWeight:700}}>{fmt(r.orderVal,3)}</td>
                    </tr>
                  ))}
                  <tr style={{background:C.surface,borderTop:`2px solid ${C.border}`,fontWeight:800}}>
                    <td colSpan={8} style={{padding:'10px 14px',color:C.text,fontSize:12}}>TOTAL ORDER VALUE</td>
                    <td style={{padding:'10px 14px',color:C.green,fontFamily:'monospace',fontSize:14,fontWeight:800}}>KWD {fmt(orderRows.reduce((s,r)=>s+r.orderVal,0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Per restaurant breakdown */}
          <SectionDivider label="PER RESTAURANT BREAKDOWN"/>
          {Object.entries(restConsMap).map(([rest,rc])=>{
            const restTxn = restTxnMap[rest]||1
            const restProjTxn = projTotalTxn * (restTxn/totalTxnBaseline)
            const restRows = Object.entries(rc).filter(([,v])=>v.qty>0).map(([code,v])=>{
              const master = masterItems.find(m=>m.item_code===code)
              const upt = v.qty/restTxn*1000
              const projQty = upt*restProjTxn/1000
              const csQty = master?.qty_per_cs ? Math.ceil(projQty/master.qty_per_cs) : null
              const orderVal = csQty ? csQty*(master?.price_per_cs||0) : projQty*(master?.correct_price||0)
              return {code,name:v.name,unit:v.unit,supplier:master?.supplier||'—',upt,projQty,csQty,price_per_cs:master?.price_per_cs||0,orderVal}
            }).sort((a,b)=>b.orderVal-a.orderVal)
            const shortName = rest.split(' - ')[2]||rest
            const totalVal = restRows.reduce((s,r)=>s+r.orderVal,0)
            return (
              <div key={rest} style={{...cardStyle,padding:0,overflow:'hidden'}}>
                <div style={{padding:'12px 18px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <p style={{fontSize:13,fontWeight:700,color:C.text,margin:0}}>📍 {shortName}</p>
                  <div style={{display:'flex',gap:12,alignItems:'center'}}>
                    <span style={{fontSize:11,color:C.muted}}>Proj. txn: {fmt(restProjTxn,0)}</span>
                    <span style={{fontSize:12,fontWeight:700,color:C.green,fontFamily:'monospace'}}>KWD {fmt(totalVal)}</span>
                  </div>
                </div>
                <div style={{overflowX:'auto',maxHeight:300}}>
                  <table style={{width:'100%',fontSize:11,borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{background:`${C.border}40`}}>
                        {['Code','Item Name','Unit','Supplier','UPT/1K','Proj. Qty','CS Qty','Order Value'].map(h=>(
                          <th key={h} style={{padding:'8px 14px',color:C.dim,fontWeight:700,fontSize:9,letterSpacing:'0.07em',textAlign:'left',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {restRows.map((r,i)=>(
                        <tr key={i} style={{borderTop:`1px solid ${C.border}30`}}>
                          <td style={{padding:'7px 14px',color:C.muted,fontFamily:'monospace',fontSize:10}}>{r.code}</td>
                          <td style={{padding:'7px 14px',color:C.text,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</td>
                          <td style={{padding:'7px 14px',color:C.muted}}>{r.unit}</td>
                          <td style={{padding:'7px 14px',color:C.muted,fontSize:10}}>{r.supplier}</td>
                          <td style={{padding:'7px 14px',color:C.accent,fontFamily:'monospace'}}>{fmt(r.upt,4)}</td>
                          <td style={{padding:'7px 14px',color:C.text,fontFamily:'monospace'}}>{fmt(r.projQty,3)}</td>
                          <td style={{padding:'7px 14px',color:C.amber,fontFamily:'monospace',fontWeight:700}}>{r.csQty??'—'}</td>
                          <td style={{padding:'7px 14px',color:C.green,fontFamily:'monospace',fontWeight:700}}>{fmt(r.orderVal,3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
