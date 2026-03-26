'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function DashboardClient() {
  const supabase = createClient()
  const [restaurants, setRestaurants] = useState<string[]>([])
  const [selectedRest, setSelectedRest] = useState('all')
  const [loading, setLoading] = useState(true)
  const [lastUpload, setLastUpload] = useState<string>('')

  // KPI data
  const [sales, setSales] = useState({ last: 0, mtd: 0, ytd: 0, lastDate: '', lastWeekPct: 0 })
  const [txn, setTxn] = useState({ last: 0, mtd: 0, ytd: 0, lastDate: '' })
  const [meals, setMeals] = useState({ last: 0, mtd: 0, ytd: 0, lastDate: '' })
  const [delivery, setDelivery] = useState({ last: 0, mtd: 0, ytd: 0 })
  const [avgTicket, setAvgTicket] = useState(0)
  const [avgDailySales, setAvgDailySales] = useState(0)
  const [avgDailyTxn, setAvgDailyTxn] = useState(0)
  const [totalQtySold, setTotalQtySold] = useState(0)

  // Chart & table data
  const [dailySales, setDailySales] = useState<{date:string;sales:number;txn:number}[]>([])
  const [salesByLocation, setSalesByLocation] = useState<{name:string;sales:number;pct:number}[]>([])
  const [topItems, setTopItems] = useState<{name:string;qty:number;kwd:number}[]>([])
  const [bottomItems, setBottomItems] = useState<{name:string;qty:number;kwd:number}[]>([])
  const [categoryVolume, setCategoryVolume] = useState<{cat:string;qty:number;pct:number}[]>([])
  const [topWasted, setTopWasted] = useState<{name:string;waste:number;pct:number}[]>([])
  const [topGain, setTopGain] = useState<{name:string;location:string;gain:number;pct:number}[]>([])
  const [topLoss, setTopLoss] = useState<{name:string;location:string;loss:number;pct:number}[]>([])
  const [top7Sold, setTop7Sold] = useState<{name:string;qty:number;kwd:number}[]>([])
  const [low5Sold, setLow5Sold] = useState<{name:string;qty:number;kwd:number}[]>([])

  useEffect(() => {
    supabase.from('restaurants').select('name').eq('active', true).order('name')
      .then(({data}) => setRestaurants(data?.map((r:any)=>r.name)??[]))
  }, [])

  useEffect(() => { loadAll() }, [selectedRest])

  async function loadAll() {
    setLoading(true)
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const mtdFrom = `${year}-${String(month).padStart(2,'0')}-01`
    const ytdFrom = `${year}-01-01`
    const today = now.toISOString().split('T')[0]

    function applyRest(q: any) {
      return selectedRest !== 'all' ? q.eq('restaurant_name', selectedRest) : q
    }

    // Get latest date with data
    const {data: latestRow} = await applyRest(supabase.from('hourly_sales').select('date').order('date', {ascending:false}).limit(1))
    const latestDate = latestRow?.[0]?.date ?? ''
    setLastUpload(latestDate)

    if (!latestDate) { setLoading(false); return }

    // Last upload day data
    const {data: lastSalesD} = await applyRest(supabase.from('hourly_sales').select('net_sales,no_of_tickets,apt').eq('date', latestDate))
    const lastSales = lastSalesD?.reduce((s:number,r:any)=>s+(r.net_sales||0),0)??0
    const lastTxn = lastSalesD?.reduce((s:number,r:any)=>s+(r.no_of_tickets||0),0)??0
    const lastApt = lastTxn > 0 ? lastSales/lastTxn : 0

    // MTD
    const {data: mtdSalesD} = await applyRest(supabase.from('hourly_sales').select('net_sales,no_of_tickets').gte('date',mtdFrom).lte('date',today))
    const mtdSales = mtdSalesD?.reduce((s:number,r:any)=>s+(r.net_sales||0),0)??0
    const mtdTxn = mtdSalesD?.reduce((s:number,r:any)=>s+(r.no_of_tickets||0),0)??0
    const mtdDays = [...new Set(mtdSalesD?.map((r:any)=>r.date)??[])].length

    // YTD
    const {data: ytdSalesD} = await applyRest(supabase.from('hourly_sales').select('net_sales,no_of_tickets').gte('date',ytdFrom).lte('date',today))
    const ytdSales = ytdSalesD?.reduce((s:number,r:any)=>s+(r.net_sales||0),0)??0
    const ytdTxn = ytdSalesD?.reduce((s:number,r:any)=>s+(r.no_of_tickets||0),0)??0
    const ytdDays = [...new Set(ytdSalesD?.map((r:any)=>r.date)??[])].length

    setSales({last:lastSales, mtd:mtdSales, ytd:ytdSales, lastDate:latestDate, lastWeekPct:0})
    setTxn({last:lastTxn, mtd:mtdTxn, ytd:ytdTxn, lastDate:latestDate})
    setAvgTicket(lastApt)
    setAvgDailySales(mtdDays>0?mtdSales/mtdDays:0)
    setAvgDailyTxn(mtdDays>0?mtdTxn/mtdDays:0)

    // Meals
    const {data: lastMealD} = await applyRest(supabase.from('meal_count').select('meal_count').eq('date', latestDate))
    const {data: mtdMealD}  = await applyRest(supabase.from('meal_count').select('meal_count').gte('date',mtdFrom).lte('date',today))
    const {data: ytdMealD}  = await applyRest(supabase.from('meal_count').select('meal_count').gte('date',ytdFrom).lte('date',today))
    const sumMeals = (d:any[]) => d?.reduce((s:number,r:any)=>s+(r.meal_count||0),0)??0
    setMeals({last:sumMeals(lastMealD??[]), mtd:sumMeals(mtdMealD??[]), ytd:sumMeals(ytdMealD??[]), lastDate:latestDate})

    // Delivery
    const {data: lastDelD} = await applyRest(supabase.from('delivery_sales').select('net_sales,number_of_bills').eq('date', latestDate))
    const {data: mtdDelD}  = await applyRest(supabase.from('delivery_sales').select('net_sales,number_of_bills').gte('date',mtdFrom).lte('date',today))
    const {data: ytdDelD}  = await applyRest(supabase.from('delivery_sales').select('net_sales').gte('date',ytdFrom).lte('date',today))
    setDelivery({
      last: lastDelD?.reduce((s:number,r:any)=>s+(r.net_sales||0),0)??0,
      mtd:  mtdDelD?.reduce((s:number,r:any)=>s+(r.net_sales||0),0)??0,
      ytd:  ytdDelD?.reduce((s:number,r:any)=>s+(r.net_sales||0),0)??0,
    })

    // Daily sales trend (MTD)
    const dayMap: Record<string,{sales:number;txn:number}> = {}
    mtdSalesD?.forEach((r:any)=>{
      if(!dayMap[r.date]) dayMap[r.date]={sales:0,txn:0}
      dayMap[r.date].sales += r.net_sales||0
      dayMap[r.date].txn += r.no_of_tickets||0
    })
    setDailySales(Object.entries(dayMap).map(([date,v])=>({date,...v})).sort((a,b)=>a.date.localeCompare(b.date)))

    // Sales by location (MTD)
    const locMap: Record<string,number> = {}
    mtdSalesD?.forEach((r:any)=>{ locMap[r.restaurant_name]=(locMap[r.restaurant_name]||0)+(r.net_sales||0) })
    const totalLoc = Object.values(locMap).reduce((a,b)=>a+b,0)
    setSalesByLocation(Object.entries(locMap).map(([name,sales])=>({name:name.split(' - ')[2]||name,sales,pct:totalLoc>0?sales/totalLoc*100:0})).sort((a,b)=>b.sales-a.sales))

    // Product mix MTD — top/bottom items
    const {data: menuMtd} = await applyRest(supabase.from('menu_mix').select('item_name,number_sold,amount').gte('date',mtdFrom).lte('date',today))
    const itemMap: Record<string,{qty:number;kwd:number}> = {}
    menuMtd?.forEach((r:any)=>{
      if(!itemMap[r.item_name]) itemMap[r.item_name]={qty:0,kwd:0}
      itemMap[r.item_name].qty += r.number_sold||0
      itemMap[r.item_name].kwd += r.amount||0
    })
    const itemArr = Object.entries(itemMap).map(([name,v])=>({name,...v})).filter(i=>i.qty>0)
    setTotalQtySold(itemArr.reduce((s,i)=>s+i.qty,0))
    setTopItems(itemArr.sort((a,b)=>b.kwd-a.kwd).slice(0,5))
    setTop7Sold(itemArr.sort((a,b)=>b.qty-a.qty).slice(0,7))
    setLow5Sold(itemArr.sort((a,b)=>a.qty-b.qty).slice(0,5))
    setBottomItems(itemArr.sort((a,b)=>a.kwd-b.kwd).slice(0,5))

    // Category volume MTD
    const {data: menuCatD} = await applyRest(supabase.from('menu_mix').select('scategory,number_sold').gte('date',mtdFrom).lte('date',today))
    const catMap: Record<string,number> = {}
    menuCatD?.forEach((r:any)=>{ catMap[r.scategory]=(catMap[r.scategory]||0)+(r.number_sold||0) })
    const totalCat = Object.values(catMap).reduce((a,b)=>a+b,0)
    setCategoryVolume(Object.entries(catMap).map(([cat,qty])=>({cat,qty,pct:totalCat>0?qty/totalCat*100:0})).sort((a,b)=>b.qty-a.qty).slice(0,8))

    // Waste & variance (inventory MTD)
    const {data: invMtd} = await applyRest(supabase.from('inventory').select('item_name,wastage,variance,average_price,restaurant_name').gte('date',mtdFrom).lte('date',today))
    const wasteMap: Record<string,{waste:number;total:number}> = {}
    const varMap: Record<string,{variance:number;location:string}> = {}
    invMtd?.forEach((r:any)=>{
      if(!wasteMap[r.item_name]) wasteMap[r.item_name]={waste:0,total:0}
      wasteMap[r.item_name].waste += (r.wastage||0)*(r.average_price||0)
      wasteMap[r.item_name].total += (r.wastage||0)
      if(r.variance) {
        const k = `${r.item_name}||${r.restaurant_name}`
        if(!varMap[k]) varMap[k]={variance:0,location:r.restaurant_name?.split(' - ')[2]||r.restaurant_name||''}
        varMap[k].variance += r.variance||0
      }
    })
    const totalWaste = Object.values(wasteMap).reduce((s,v)=>s+v.waste,0)
    setTopWasted(Object.entries(wasteMap).map(([name,v])=>({name,waste:v.waste,pct:totalWaste>0?v.waste/totalWaste*100:0})).sort((a,b)=>b.waste-a.waste).slice(0,5))
    setTopGain(Object.entries(varMap).filter(([,v])=>v.variance>0).map(([k,v])=>({name:k.split('||')[0],location:v.location,gain:v.variance,pct:0})).sort((a,b)=>b.gain-a.gain).slice(0,5))
    setTopLoss(Object.entries(varMap).filter(([,v])=>v.variance<0).map(([k,v])=>({name:k.split('||')[0],location:v.location,loss:Math.abs(v.variance),pct:0})).sort((a,b)=>b.loss-a.loss).slice(0,5))

    setLoading(false)
  }

  const fmt = (n:number, dec=2) => n.toLocaleString('en',{minimumFractionDigits:dec,maximumFractionDigits:dec})
  const fmtDate = (d:string) => { if(!d) return '—'; const dt=new Date(d); return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}` }

  // Mini bar chart
  const maxSale = Math.max(...dailySales.map(d=>d.sales), 1)

  const KPIBlock = ({label, last, lastDate, mtd, mtdLabel, ytd, ytdLabel, color='text-blue-600'}:{label:string;last:number;lastDate:string;mtd:number;mtdLabel?:string;ytd:number;ytdLabel?:string;color?:string}) => (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex-1 min-w-0">
      <p className={`text-sm font-semibold mb-3 ${color}`}>{label}</p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-xs text-gray-400 uppercase mb-1">Last Updated</p>
          <p className="text-xl font-bold font-mono text-gray-900">{fmt(last)}</p>
          <span className="inline-block mt-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{fmtDate(lastDate)}</span>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase mb-1">Month to Date</p>
          <p className="text-xl font-bold font-mono text-gray-900">{fmt(mtd)}</p>
          {mtdLabel && <p className="text-xs text-gray-400 mt-1">{mtdLabel}</p>}
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase mb-1">Year to Date</p>
          <p className="text-xl font-bold font-mono text-gray-900">{fmt(ytd)}</p>
          {ytdLabel && <p className="text-xs text-gray-400 mt-1">{ytdLabel}</p>}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Operations Dashboard</h1>
          {lastUpload && <p className="text-xs text-green-600 mt-0.5">● Last upload: {fmtDate(lastUpload)}</p>}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={selectedRest} onChange={e=>setSelectedRest(e.target.value)}>
            <option value="all">All Locations</option>
            {restaurants.map(r=><option key={r} value={r}>{r.split(' - ')[2]||r}</option>)}
          </select>
          <button onClick={loadAll} disabled={loading}
            className="flex items-center gap-2 text-sm border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-3.5 py-2 rounded-lg transition-colors">
            {loading ? <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"/> :
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><path d="M1 8a7 7 0 0 1 14 0M8 1v4M5 4l3-3 3 3"/></svg>}
            Refresh
          </button>
        </div>
      </div>

      {/* Top KPI row — Sales, Transactions, Meals */}
      <div className="flex gap-3 flex-wrap">
        <KPIBlock label="💵 Sales (KWD)" last={sales.last} lastDate={sales.lastDate} mtd={sales.mtd} ytd={sales.ytd} color="text-blue-600"/>
        <KPIBlock label="🔄 Transactions" last={txn.last} lastDate={txn.lastDate} mtd={txn.mtd} ytd={txn.ytd} color="text-green-600"/>
        <KPIBlock label="🍽️ Meals" last={meals.last} lastDate={meals.lastDate} mtd={meals.mtd} ytd={meals.ytd} color="text-amber-600"/>
      </div>

      {/* Delivery row */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex-1 min-w-0">
          <p className="text-sm font-semibold text-pink-600 mb-3">🚚 Delivery Sales (KWD)</p>
          <div className="grid grid-cols-3 gap-2">
            {[{label:'Last Updated',v:delivery.last},{label:'Month to Date',v:delivery.mtd},{label:'Year to Date',v:delivery.ytd}].map((k,i)=>(
              <div key={i}>
                <p className="text-xs text-gray-400 uppercase mb-1">{k.label}</p>
                <p className="text-xl font-bold font-mono text-gray-900">{fmt(k.v)}</p>
              </div>
            ))}
          </div>
        </div>
        {/* Bottom metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-0">
          {[
            {label:'AVG TICKET (APT)', value:fmt(avgTicket,3), sub:'KWD per ticket'},
            {label:'AVG DAILY SALES',  value:fmt(avgDailySales), sub:'KWD / day'},
            {label:'AVG DAILY TXN',    value:fmt(avgDailyTxn,0), sub:'Tickets / day'},
            {label:'TOTAL QTY SOLD',   value:totalQtySold.toLocaleString(), sub:'Items (product mix)'},
          ].map((k,i)=>(
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
              <p className={`text-lg font-bold font-mono ${i===1?'text-amber-500':i===2?'text-blue-600':'text-gray-900'}`}>{k.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Sales Trend + Sales by Location */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Periodic Sales</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Daily trend chart */}
          <div className="sm:col-span-2 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 mb-1">Daily Sales Trend</p>
            <p className="text-xs text-gray-400 mb-4">Net sales per day — month to date</p>
            {dailySales.length > 0 ? (
              <div className="flex items-end gap-1 h-20">
                {dailySales.map((d,i)=>(
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer relative"
                      style={{height:`${Math.max((d.sales/maxSale)*72,2)}px`}}
                      title={`${d.date}: KWD ${fmt(d.sales)}`}/>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-gray-400 text-center py-8">No data</p>}
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              {dailySales.length > 0 && <>
                <span>{dailySales[0]?.date?.split('-')[2]}</span>
                <span>{dailySales[Math.floor(dailySales.length/2)]?.date?.split('-')[2]}</span>
                <span>{dailySales[dailySales.length-1]?.date?.split('-')[2]}</span>
              </>}
            </div>
          </div>

          {/* Sales by location */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 mb-1">Sales by Location</p>
            <p className="text-xs text-gray-400 mb-4">Revenue split for selected period</p>
            {salesByLocation.length > 0 ? (
              <div className="flex flex-col gap-3">
                {salesByLocation.map((l,i)=>{
                  const colors=['bg-blue-500','bg-amber-400','bg-green-500','bg-pink-500']
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-700 font-medium truncate max-w-[120px]">{l.name}</span>
                        <span className="text-gray-500 font-mono">{l.pct.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className={`h-2 rounded-full ${colors[i]||'bg-gray-400'}`} style={{width:`${l.pct}%`}}/>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">KWD {fmt(l.sales)}</p>
                    </div>
                  )
                })}
              </div>
            ) : <p className="text-xs text-gray-400 text-center py-8">No data</p>}
          </div>
        </div>
      </div>

      {/* Product Mix section */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Product Mix Performance</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Top 5 by revenue */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">🏆 Top 5 Items by Revenue</p>
              <p className="text-xs text-gray-400">Highest KWD — product mix</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">#</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Item</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500">Qty</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500">KWD</th>
              </tr></thead>
              <tbody>
                {topItems.length > 0 ? topItems.map((item,i)=>(
                  <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i+1}</td>
                    <td className="px-3 py-2 font-medium text-gray-700 max-w-[140px] truncate">{item.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-600">{item.qty.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-gray-800">{fmt(item.kwd)}</td>
                  </tr>
                )) : <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No data</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Top 7 by qty sold */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">📈 Top 7 Sold Items</p>
              <p className="text-xs text-gray-400">By qty sold — product mix</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">#</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Item</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500">Qty</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500">KWD</th>
              </tr></thead>
              <tbody>
                {top7Sold.length > 0 ? top7Sold.map((item,i)=>(
                  <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i+1}</td>
                    <td className="px-3 py-2 font-medium text-gray-700 max-w-[140px] truncate">{item.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-600">{item.qty.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-600">{fmt(item.kwd)}</td>
                  </tr>
                )) : <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No data</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Lowest 5 + Category Volume */}
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">📉 Lowest 5 Sold</p>
                <p className="text-xs text-gray-400">Least sold — product mix</p>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-gray-50"><tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">#</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Item</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Qty</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">KWD</th>
                </tr></thead>
                <tbody>
                  {low5Sold.length > 0 ? low5Sold.map((item,i)=>(
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i+1}</td>
                      <td className="px-3 py-2 font-medium text-gray-700 max-w-[120px] truncate">{item.name}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-500">{item.qty.toFixed(0)}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600">{fmt(item.kwd)}</td>
                    </tr>
                  )) : <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No data</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">📊 Category Volume</p>
                <p className="text-xs text-gray-400">Total qty sold per category</p>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-gray-50"><tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500">Category</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">Qty</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-500">%</th>
                </tr></thead>
                <tbody>
                  {categoryVolume.length > 0 ? categoryVolume.map((c,i)=>(
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-700 truncate max-w-[100px]">{c.cat||'—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-600">{c.qty.toFixed(0)}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-500">{c.pct.toFixed(1)}%</td>
                    </tr>
                  )) : <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">No data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Waste / Variance / Gain & Loss */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Waste · Menu Performance · Gain & Loss</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Top 5 Wasted */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-red-600">🗑️ Top 5 Wasted Items</p>
              <p className="text-xs text-gray-400">By waste amount (KWD)</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">#</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Item</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500">Waste KWD</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500">%</th>
              </tr></thead>
              <tbody>
                {topWasted.length > 0 ? topWasted.map((w,i)=>(
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i+1}</td>
                    <td className="px-3 py-2 font-medium text-gray-700 max-w-[100px] truncate">{w.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-red-500">{fmt(w.waste,3)}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-400">{w.pct.toFixed(1)}%</td>
                  </tr>
                )) : <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No data</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Top 7 sold (menu mix) */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-green-600">🍗 Top 7 Sold Items</p>
              <p className="text-xs text-gray-400">By qty sold · product mix</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">#</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Item</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500">Qty</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500">KWD</th>
              </tr></thead>
              <tbody>
                {top7Sold.length > 0 ? top7Sold.map((item,i)=>(
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i+1}</td>
                    <td className="px-3 py-2 font-medium text-gray-700 max-w-[100px] truncate">{item.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-600">{item.qty.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-600">{fmt(item.kwd)}</td>
                  </tr>
                )) : <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No data</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Top 5 Gain */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-green-600">📈 Top 5 Gain Items</p>
              <p className="text-xs text-gray-400">Positive variance · surplus stock</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">#</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Item</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Location</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500">Gain</th>
              </tr></thead>
              <tbody>
                {topGain.length > 0 ? topGain.map((g,i)=>(
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i+1}</td>
                    <td className="px-3 py-2 font-medium text-gray-700 max-w-[80px] truncate">{g.name}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[70px] truncate">{g.location}</td>
                    <td className="px-3 py-2 text-right font-mono text-green-600">+{g.gain.toFixed(2)}</td>
                  </tr>
                )) : <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No data</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Top 5 Loss */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-red-600">📉 Top 5 Loss Items</p>
              <p className="text-xs text-gray-400">Negative variance · highest loss</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                <th className="text-left px-3 py-2 font-medium text-gray-500">#</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Item</th>
                <th className="text-left px-3 py-2 font-medium text-gray-500">Location</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500">Loss</th>
              </tr></thead>
              <tbody>
                {topLoss.length > 0 ? topLoss.map((l,i)=>(
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i+1}</td>
                    <td className="px-3 py-2 font-medium text-gray-700 max-w-[80px] truncate">{l.name}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[70px] truncate">{l.location}</td>
                    <td className="px-3 py-2 text-right font-mono text-red-500">-{l.loss.toFixed(2)}</td>
                  </tr>
                )) : <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
