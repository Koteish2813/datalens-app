'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { REPORT_LABELS, type ReportType } from '@/lib/excel-parser'

const REPORT_TYPES: ReportType[] = ['hourly_sales','delivery_sales','meal_count','menu_mix','inventory']
const PALETTES = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899']

function fmt(n: any): string {
  const num = Number(n)
  if (isNaN(num)) return '–'
  const a = Math.abs(num)
  if (a >= 1e6) return num.toFixed(2)+'M'
  if (a >= 1e3) return num.toFixed(1)+'K'
  return num.toFixed(3).replace(/\.?0+$/, '')
}

export default function ReportsClient({ role }: { role: string }) {
  const supabase = createClient()
  const [tab, setTab] = useState<ReportType>('hourly_sales')
  const [restaurants, setRestaurants] = useState<string[]>([])
  const [selectedRestaurant, setSelectedRestaurant] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  // Load distinct restaurants on mount
  useEffect(() => {
    async function loadRestaurants() {
      const tables = ['hourly_sales','delivery_sales','meal_count','menu_mix','inventory']
      const all = new Set<string>()
      for (const t of tables) {
        const { data } = await supabase.from(t).select('restaurant_name')
        data?.forEach((r: any) => all.add(r.restaurant_name))
      }
      setRestaurants(Array.from(all).sort())
    }
    loadRestaurants()
  }, [])

  // Load data when filters change
  useEffect(() => { loadData() }, [tab, selectedRestaurant, dateFrom, dateTo])

  async function loadData() {
    setLoading(true)
    setAiText('')
    let query = supabase.from(tab).select('*').order('date', { ascending: false }).limit(1000)
    if (selectedRestaurant !== 'all') query = query.eq('restaurant_name', selectedRestaurant)
    if (dateFrom) query = query.gte('date', dateFrom)
    if (dateTo) query = query.lte('date', dateTo)
    const { data: rows } = await query
    setData(rows ?? [])
    setLoading(false)
  }

  async function generateAI() {
    if (!data.length) return
    setAiLoading(true)
    const sample = data.slice(0, 50)
    const cols = Object.keys(sample[0] || {}).filter(k => !['id','uploaded_by','uploaded_at'].includes(k))
    const summary = cols.map(col => {
      const vals = data.map(r => Number(r[col])).filter(v => !isNaN(v) && v !== 0)
      if (!vals.length) return null
      const sum = vals.reduce((a,b)=>a+b,0)
      return `${col}: sum=${sum.toFixed(2)}, avg=${(sum/vals.length).toFixed(2)}, max=${Math.max(...vals).toFixed(2)}`
    }).filter(Boolean).join('\n')

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 1000,
          messages: [{ role: 'user', content:
            `You are a restaurant analytics expert. Analyze this ${REPORT_LABELS[tab]} data.\nRestaurant filter: ${selectedRestaurant}\nDate range: ${dateFrom || 'all'} to ${dateTo || 'all'}\nTotal records: ${data.length}\nStats:\n${summary}\nProvide: 1) Key findings 2) Performance highlights 3) Concerns or anomalies 4) Recommendations. Be specific with numbers.`
          }]
        })
      })
      const d = await res.json()
      setAiText(d.content?.find((b:any)=>b.type==='text')?.text || 'No response.')
    } catch { setAiText('⚠️ Could not reach Claude AI.') }
    setAiLoading(false)
  }

  // Compute KPIs based on current tab
  const kpis = (() => {
    if (!data.length) return []
    switch (tab) {
      case 'hourly_sales': {
        const netSales = data.reduce((s,r)=>s+(Number(r.net_sales)||0),0)
        const tickets = data.reduce((s,r)=>s+(Number(r.no_of_tickets)||0),0)
        const avgAPT = data.reduce((s,r)=>s+(Number(r.apt)||0),0)/data.length
        const discount = data.reduce((s,r)=>s+(Number(r.discount)||0),0)
        return [
          {label:'Net Sales (KWD)', value:fmt(netSales)},
          {label:'Total Tickets', value:tickets.toLocaleString()},
          {label:'Avg APT', value:fmt(avgAPT)},
          {label:'Total Discount', value:fmt(discount)},
          {label:'Days', value:new Set(data.map(r=>r.date)).size},
        ]
      }
      case 'delivery_sales': {
        const netSales = data.reduce((s,r)=>s+(Number(r.net_sales)||0),0)
        const bills = data.reduce((s,r)=>s+(Number(r.number_of_bills)||0),0)
        const platforms = new Set(data.map(r=>r.platform)).size
        return [
          {label:'Net Sales (KWD)', value:fmt(netSales)},
          {label:'Total Bills', value:bills.toLocaleString()},
          {label:'Platforms', value:platforms},
          {label:'Days', value:new Set(data.map(r=>r.date)).size},
        ]
      }
      case 'meal_count': {
        const totalMeals = data.reduce((s,r)=>s+(Number(r.meal_count)||0),0)
        const totalQty = data.reduce((s,r)=>s+(Number(r.total_quantity)||0),0)
        const totalRev = data.reduce((s,r)=>s+(Number(r.total_price)||0),0)
        const items = new Set(data.map(r=>r.item_name)).size
        return [
          {label:'Total Meals', value:totalMeals.toLocaleString()},
          {label:'Total Qty', value:totalQty.toLocaleString()},
          {label:'Revenue (KWD)', value:fmt(totalRev)},
          {label:'Unique Items', value:items},
        ]
      }
      case 'menu_mix': {
        const netSales = data.reduce((s,r)=>s+(Number(r.net_sales)||0),0)
        const sold = data.reduce((s,r)=>s+(Number(r.number_sold)||0),0)
        const categories = new Set(data.map(r=>r.scategory)).size
        return [
          {label:'Net Sales (KWD)', value:fmt(netSales)},
          {label:'Total Sold', value:sold.toLocaleString()},
          {label:'Categories', value:categories},
          {label:'Items', value:new Set(data.map(r=>r.item_name)).size},
        ]
      }
      case 'inventory': {
        const totalWastage = data.reduce((s,r)=>s+(Number(r.wastage)||0),0)
        const totalVariance = data.reduce((s,r)=>s+(Number(r.variance)||0),0)
        const items = new Set(data.map(r=>r.item_name)).size
        return [
          {label:'Total Items', value:items},
          {label:'Total Wastage', value:fmt(totalWastage)},
          {label:'Total Variance', value:fmt(totalVariance)},
          {label:'Categories', value:new Set(data.map(r=>r.category)).size},
        ]
      }
    }
  })()

  // Bar chart helper
  function BarChart({ items, labelKey, valueKey, title }: any) {
    if (!items?.length) return <div className="text-xs text-gray-400 py-4 text-center">No data</div>
    const max = Math.max(...items.map((i:any)=>Number(i[valueKey])||0), 1)
    return (
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-3">{title}</p>
        <div className="flex flex-col gap-1.5">
          {items.slice(0,10).map((item:any, i:number) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-32 truncate shrink-0">{String(item[labelKey]).slice(0,20)}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                <div className="h-4 rounded-full flex items-center px-2"
                  style={{width:`${Math.max((Number(item[valueKey])||0)/max*100,2)}%`, background:PALETTES[i%PALETTES.length]}}>
                  <span className="text-white text-xs font-mono truncate">{fmt(item[valueKey])}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Chart data per tab
  function renderCharts() {
    if (!data.length) return <div className="text-sm text-gray-400 text-center py-8">No data for selected filters</div>
    switch(tab) {
      case 'hourly_sales': {
        const byHour = Object.entries(data.reduce((acc:any,r)=>{
          const h=r.hour; acc[h]=(acc[h]||0)+(Number(r.net_sales)||0); return acc
        },{})).map(([hour,net_sales])=>({hour,net_sales})).sort((a,b)=>String(a.hour).localeCompare(String(b.hour)))
        const byRestaurant = Object.entries(data.reduce((acc:any,r)=>{
          acc[r.restaurant_name]=(acc[r.restaurant_name]||0)+(Number(r.net_sales)||0); return acc
        },{})).map(([restaurant_name,net_sales])=>({restaurant_name,net_sales}))
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <BarChart items={byHour} labelKey="hour" valueKey="net_sales" title="Net Sales by Hour (KWD)"/>
            <BarChart items={byRestaurant} labelKey="restaurant_name" valueKey="net_sales" title="Net Sales by Restaurant (KWD)"/>
          </div>
        )
      }
      case 'delivery_sales': {
        const byPlatform = Object.entries(data.reduce((acc:any,r)=>{
          acc[r.platform]=(acc[r.platform]||0)+(Number(r.net_sales)||0); return acc
        },{})).map(([platform,net_sales])=>({platform,net_sales}))
        const byHour = Object.entries(data.reduce((acc:any,r)=>{
          acc[r.hour]=(acc[r.hour]||0)+(Number(r.net_sales)||0); return acc
        },{})).map(([hour,net_sales])=>({hour,net_sales})).sort((a,b)=>String(a.hour).localeCompare(String(b.hour)))
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <BarChart items={byPlatform} labelKey="platform" valueKey="net_sales" title="Sales by Platform (KWD)"/>
            <BarChart items={byHour} labelKey="hour" valueKey="net_sales" title="Sales by Hour (KWD)"/>
          </div>
        )
      }
      case 'meal_count': {
        const byCategory = Object.entries(data.reduce((acc:any,r)=>{
          acc[r.category]=(acc[r.category]||0)+(Number(r.meal_count)||0); return acc
        },{})).map(([category,meal_count])=>({category,meal_count})).sort((a:any,b:any)=>Number(b.meal_count)-Number(a.meal_count))
        const topItems = Object.entries(data.reduce((acc:any,r)=>{
          acc[r.item_name]=(acc[r.item_name]||0)+(Number(r.meal_count)||0); return acc
        },{})).map(([item_name,meal_count])=>({item_name,meal_count})).sort((a:any,b:any)=>Number(b.meal_count)-Number(a.meal_count))
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <BarChart items={byCategory} labelKey="category" valueKey="meal_count" title="Meal Count by Category"/>
            <BarChart items={topItems} labelKey="item_name" valueKey="meal_count" title="Top 10 Items by Meal Count"/>
          </div>
        )
      }
      case 'menu_mix': {
        const byCategory = Object.entries(data.reduce((acc:any,r)=>{
          acc[r.scategory]=(acc[r.scategory]||0)+(Number(r.net_sales)||0); return acc
        },{})).map(([scategory,net_sales])=>({scategory,net_sales})).sort((a:any,b:any)=>Number(b.net_sales)-Number(a.net_sales))
        const topItems = Object.entries(data.reduce((acc:any,r)=>{
          acc[r.item_name]=(acc[r.item_name]||0)+(Number(r.net_sales)||0); return acc
        },{})).map(([item_name,net_sales])=>({item_name,net_sales})).sort((a:any,b:any)=>Number(b.net_sales)-Number(a.net_sales))
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <BarChart items={byCategory} labelKey="scategory" valueKey="net_sales" title="Sales by Category (KWD)"/>
            <BarChart items={topItems} labelKey="item_name" valueKey="net_sales" title="Top 10 Items by Sales (KWD)"/>
          </div>
        )
      }
      case 'inventory': {
        const topWaste = Object.entries(data.reduce((acc:any,r)=>{
          acc[r.item_name]=(acc[r.item_name]||0)+(Number(r.wastage)||0); return acc
        },{})).map(([item_name,wastage])=>({item_name,wastage})).sort((a:any,b:any)=>Number(b.wastage)-Number(a.wastage))
        const topVariance = Object.entries(data.reduce((acc:any,r)=>{
          if (r.variance !== null) acc[r.item_name]=(acc[r.item_name]||0)+(Math.abs(Number(r.variance))||0); return acc
        },{})).map(([item_name,variance])=>({item_name,variance})).sort((a:any,b:any)=>Number(b.variance)-Number(a.variance))
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <BarChart items={topWaste} labelKey="item_name" valueKey="wastage" title="Top Wastage Items"/>
            <BarChart items={topVariance} labelKey="item_name" valueKey="variance" title="Top Variance Items (Abs)"/>
          </div>
        )
      }
    }
  }

  // Data table columns per tab
  const tableCols: Record<ReportType, string[]> = {
    hourly_sales:   ['date','restaurant_name','hour','no_of_tickets','net_sales','gross_sales','discount','apt'],
    delivery_sales: ['date','restaurant_name','hour','platform','number_of_bills','net_sales','gross_sales','discount'],
    meal_count:     ['date','restaurant_name','super_category','category','item_name','meal_count','total_quantity','total_price'],
    menu_mix:       ['date','restaurant_name','scategory','item_name','number_sold','net_sales','pct_of_sales','pct_of_scategory'],
    inventory:      ['date','restaurant_name','item_name','category','opening','closing','wastage','variance','variance_pct'],
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Restaurant:</label>
          <select className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white" value={selectedRestaurant} onChange={e=>setSelectedRestaurant(e.target.value)}>
            <option value="all">All Restaurants</option>
            {restaurants.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">From:</label>
          <input type="date" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">To:</label>
          <input type="date" className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5" value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
        </div>
        <button onClick={()=>{setDateFrom('');setDateTo('');setSelectedRestaurant('all')}}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 ml-auto">
          Clear filters
        </button>
      </div>

      {/* Report type tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
        {REPORT_TYPES.map(t => (
          <button key={t} onClick={()=>setTab(t)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab===t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {REPORT_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-8 justify-center">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin"/>
          Loading data…
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          {kpis && kpis.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {kpis.map((k,i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
                  <p className="text-lg font-semibold font-mono text-gray-900">{k.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Charts */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 mb-4">{REPORT_LABELS[tab]} — Visual Summary</p>
            {renderCharts()}
          </div>

          {/* AI Insights */}
          {(role === 'super_admin' || role === 'admin') && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800">AI Insights</p>
                  <p className="text-xs text-gray-400">Powered by Claude</p>
                </div>
                <button onClick={generateAI} disabled={aiLoading || !data.length}
                  className="flex items-center gap-2 text-xs bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white px-3.5 py-2 rounded-lg transition-colors">
                  {aiLoading ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"/> : null}
                  {aiLoading ? 'Analyzing…' : 'Generate Insights'}
                </button>
              </div>
              {aiText && (
                <div className="text-sm leading-relaxed text-gray-700" dangerouslySetInnerHTML={{__html: aiText
                  .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
                  .replace(/^\d\. (.*)/gm,'<div class="pl-4 border-l-2 border-blue-400 mb-2">$1</div>')
                  .replace(/^[-•] (.*)/gm,'<div class="pl-4 relative mb-1"><span class="absolute left-0 text-blue-500">›</span>$1</div>')
                  .replace(/\n\n/g,'<br/><br/>')
                }}/>
              )}
              {!aiText && !aiLoading && (
                <p className="text-sm text-gray-400 text-center py-4">Click "Generate Insights" to analyze the current data with Claude AI</p>
              )}
            </div>
          )}

          {/* Data Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">{REPORT_LABELS[tab]} — Data Table</p>
              <span className="text-xs text-gray-400">{data.length.toLocaleString()} records</span>
            </div>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>{tableCols[tab].map(c=><th key={c} className="text-left px-3 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{c.replace(/_/g,' ')}</th>)}</tr>
                </thead>
                <tbody>
                  {data.slice(0,200).map((row,i)=>(
                    <tr key={i} className="hover:bg-gray-50 border-b border-gray-50">
                      {tableCols[tab].map(c=>(
                        <td key={c} className="px-3 py-2 text-gray-700 whitespace-nowrap">{String(row[c]??'–').slice(0,40)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
