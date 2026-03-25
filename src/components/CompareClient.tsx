'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const METRICS = [
  { key: 'sales',     label: 'Sales & Transactions' },
  { key: 'delivery',  label: 'Delivery vs Dine-in' },
  { key: 'foodcost',  label: 'Food Cost %' },
  { key: 'pmix',      label: 'Product Mix' },
  { key: 'inventory', label: 'Consumption & Wastage' },
  { key: 'restaurant',label: 'Restaurant vs Restaurant' },
]

interface PeriodData {
  label: string
  totalTxn: number
  totalSales: number
  deliveryTxn: number
  deliverySales: number
  dineInTxn: number
  dineInSales: number
  topItems: { name: string; qty: number; revenue: number }[]
  totalConsumption: number
  totalWastage: number
  topWasted: { name: string; qty: number; cost: number }[]
  foodCostPct: number
  theoreticalCost: number
  byRestaurant: { name: string; txn: number; sales: number; delivery: number }[]
  dailySales: { day: string; sales: number; txn: number }[]
}

const EMPTY: PeriodData = {
  label:'', totalTxn:0, totalSales:0, deliveryTxn:0, deliverySales:0,
  dineInTxn:0, dineInSales:0, topItems:[], totalConsumption:0,
  totalWastage:0, topWasted:[], foodCostPct:0, theoreticalCost:0,
  byRestaurant:[], dailySales:[]
}

export default function CompareClient() {
  const supabase = createClient()
  const [restaurants, setRestaurants] = useState<string[]>([])
  const [filterRestaurant, setFilterRestaurant] = useState('all')

  // Period A
  const [fromA, setFromA] = useState('')
  const [toA, setToA] = useState('')
  const [labelA, setLabelA] = useState('Period A')

  // Period B
  const [fromB, setFromB] = useState('')
  const [toB, setToB] = useState('')
  const [labelB, setLabelB] = useState('Period B')

  const [activeMetric, setActiveMetric] = useState('sales')
  const [dataA, setDataA] = useState<PeriodData>(EMPTY)
  const [dataB, setDataB] = useState<PeriodData>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)

  useEffect(() => {
    supabase.from('restaurants').select('name').eq('active', true).order('name')
      .then(({ data }) => setRestaurants(data?.map((r: any) => r.name) ?? []))
  }, [])

  async function fetchPeriod(from: string, to: string, label: string): Promise<PeriodData> {
    const rFilter = filterRestaurant !== 'all'

    async function q(table: string, cols: string) {
      let query = supabase.from(table).select(cols).gte('date', from).lte('date', to)
      if (rFilter) query = query.eq('restaurant_name', filterRestaurant)
      const { data } = await query
      return data ?? []
    }

    const [hourly, delivery, meal, inv] = await Promise.all([
      q('hourly_sales', 'date,restaurant_name,no_of_tickets,net_sales'),
      q('delivery_sales', 'date,restaurant_name,number_of_bills,net_sales'),
      q('meal_count', 'date,restaurant_name,item_code,item_name,total_quantity,total_price,meal_count'),
      q('inventory', 'date,restaurant_name,item_name,consumption,wastage,average_price'),
    ])

    const totalTxn = hourly.reduce((s: number, r: any) => s + (r.no_of_tickets || 0), 0)
    const totalSales = hourly.reduce((s: number, r: any) => s + (r.net_sales || 0), 0)
    const deliveryTxn = delivery.reduce((s: number, r: any) => s + (r.number_of_bills || 0), 0)
    const deliverySales = delivery.reduce((s: number, r: any) => s + (r.net_sales || 0), 0)
    const dineInTxn = totalTxn - deliveryTxn
    const dineInSales = totalSales - deliverySales

    // Top items by qty
    const itemMap: Record<string, { qty: number; revenue: number }> = {}
    meal.forEach((r: any) => {
      const k = r.item_name || ''
      if (!itemMap[k]) itemMap[k] = { qty: 0, revenue: 0 }
      itemMap[k].qty += r.total_quantity || 0
      itemMap[k].revenue += r.total_price || 0
    })
    const topItems = Object.entries(itemMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)

    // Inventory
    const totalConsumption = inv.reduce((s: number, r: any) => s + (r.consumption || 0), 0)
    const totalWastage = inv.reduce((s: number, r: any) => s + (r.wastage || 0), 0)
    const wasteMap: Record<string, { qty: number; cost: number }> = {}
    inv.forEach((r: any) => {
      const k = r.item_name || ''
      if (!wasteMap[k]) wasteMap[k] = { qty: 0, cost: 0 }
      wasteMap[k].qty += r.wastage || 0
      wasteMap[k].cost += (r.wastage || 0) * (r.average_price || 0)
    })
    const topWasted = Object.entries(wasteMap)
      .map(([name, v]) => ({ name, ...v }))
      .filter(v => v.qty > 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10)

    // Food cost
    const totalRevenue = meal.reduce((s: number, r: any) => s + (r.total_price || 0), 0)
    const theoreticalCost = totalConsumption * 0.05 // approximate until recipes linked
    const foodCostPct = totalRevenue > 0 ? (theoreticalCost / totalRevenue) * 100 : 0

    // By restaurant
    const restMap: Record<string, { txn: number; sales: number; delivery: number }> = {}
    hourly.forEach((r: any) => {
      const k = r.restaurant_name || ''
      if (!restMap[k]) restMap[k] = { txn: 0, sales: 0, delivery: 0 }
      restMap[k].txn += r.no_of_tickets || 0
      restMap[k].sales += r.net_sales || 0
    })
    delivery.forEach((r: any) => {
      const k = r.restaurant_name || ''
      if (!restMap[k]) restMap[k] = { txn: 0, sales: 0, delivery: 0 }
      restMap[k].delivery += r.net_sales || 0
    })
    const byRestaurant = Object.entries(restMap).map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.sales - a.sales)

    // Daily sales
    const dayMap: Record<string, { sales: number; txn: number }> = {}
    hourly.forEach((r: any) => {
      const d = r.date || ''
      if (!dayMap[d]) dayMap[d] = { sales: 0, txn: 0 }
      dayMap[d].sales += r.net_sales || 0
      dayMap[d].txn += r.no_of_tickets || 0
    })
    const dailySales = Object.entries(dayMap)
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day))

    return {
      label, totalTxn, totalSales, deliveryTxn, deliverySales,
      dineInTxn, dineInSales, topItems, totalConsumption, totalWastage,
      topWasted, foodCostPct, theoreticalCost, byRestaurant, dailySales
    }
  }

  async function generate() {
    if (!fromA || !toA || !fromB || !toB) return
    setLoading(true)
    const [a, b] = await Promise.all([
      fetchPeriod(fromA, toA, labelA || 'Period A'),
      fetchPeriod(fromB, toB, labelB || 'Period B'),
    ])
    setDataA(a); setDataB(b)
    setGenerated(true)
    setLoading(false)
  }

  // Helper
  const pct = (a: number, b: number) => b === 0 ? 0 : ((a - b) / b * 100)
  const arrow = (v: number, invert = false) => {
    const positive = invert ? v < 0 : v > 0
    return v === 0 ? <span className="text-gray-400">—</span>
      : <span className={positive ? 'text-green-600' : 'text-red-500'}>
          {v > 0 ? '▲' : '▼'} {Math.abs(v).toFixed(1)}%
        </span>
  }
  const fmt = (n: number, dec = 2) => n.toLocaleString('en', { minimumFractionDigits: dec, maximumFractionDigits: dec })

  // Bar chart component
  const Bar = ({ valA, valB, maxVal }: { valA: number; valB: number; maxVal: number }) => (
    <div className="flex flex-col gap-1 mt-1">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"/>
        <div className="flex-1 bg-gray-100 rounded-full h-2">
          <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${maxVal > 0 ? (valA / maxVal * 100) : 0}%` }}/>
        </div>
        <span className="text-xs font-mono text-gray-600 w-20 text-right">{fmt(valA)}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"/>
        <div className="flex-1 bg-gray-100 rounded-full h-2">
          <div className="h-2 rounded-full bg-amber-400 transition-all" style={{ width: `${maxVal > 0 ? (valB / maxVal * 100) : 0}%` }}/>
        </div>
        <span className="text-xs font-mono text-gray-600 w-20 text-right">{fmt(valB)}</span>
      </div>
    </div>
  )

  // KPI card
  const KPI = ({ label, a, b, prefix = '', suffix = '', invert = false, dec = 2 }:
    { label: string; a: number; b: number; prefix?: string; suffix?: string; invert?: boolean; dec?: number }) => {
    const diff = pct(a, b)
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">{label}</p>
        <div className="flex gap-3 mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"/>
              <span className="text-xs text-gray-400">{dataA.label}</span>
            </div>
            <p className="text-base font-semibold font-mono text-gray-900">{prefix}{fmt(a, dec)}{suffix}</p>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1 mb-0.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"/>
              <span className="text-xs text-gray-400">{dataB.label}</span>
            </div>
            <p className="text-base font-semibold font-mono text-gray-900">{prefix}{fmt(b, dec)}{suffix}</p>
          </div>
        </div>
        <div className="text-xs">{arrow(diff, invert)}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Comparison Analysis</h1>
        <p className="text-sm text-gray-500 mt-0.5">Compare any two periods across all metrics — sales, delivery, product mix, inventory and more.</p>
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          {/* Period A */}
          <div className="flex-1 min-w-[280px] bg-blue-50 border border-blue-100 rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full bg-blue-500"/>
              <input type="text" placeholder="Period A label…" value={labelA} onChange={e => setLabelA(e.target.value)}
                className="text-sm font-semibold text-blue-800 bg-transparent border-none outline-none flex-1 placeholder:text-blue-300"/>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-[120px]">
                <label className="block text-xs text-blue-600 mb-1">From</label>
                <input type="date" value={fromA} onChange={e => setFromA(e.target.value)}
                  className="w-full text-sm border border-blue-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"/>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-xs text-blue-600 mb-1">To</label>
                <input type="date" value={toA} onChange={e => setToA(e.target.value)}
                  className="w-full text-sm border border-blue-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"/>
              </div>
            </div>
          </div>

          {/* VS divider */}
          <div className="flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">VS</div>
          </div>

          {/* Period B */}
          <div className="flex-1 min-w-[280px] bg-amber-50 border border-amber-100 rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full bg-amber-400"/>
              <input type="text" placeholder="Period B label…" value={labelB} onChange={e => setLabelB(e.target.value)}
                className="text-sm font-semibold text-amber-800 bg-transparent border-none outline-none flex-1 placeholder:text-amber-300"/>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-[120px]">
                <label className="block text-xs text-amber-600 mb-1">From</label>
                <input type="date" value={fromB} onChange={e => setFromB(e.target.value)}
                  className="w-full text-sm border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"/>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-xs text-amber-600 mb-1">To</label>
                <input type="date" value={toB} onChange={e => setToB(e.target.value)}
                  className="w-full text-sm border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"/>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Restaurant</label>
            <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={filterRestaurant} onChange={e => setFilterRestaurant(e.target.value)}>
              <option value="all">All Restaurants</option>
              {restaurants.map(r => <option key={r} value={r}>{r.split(' - ')[2] || r}</option>)}
            </select>
          </div>
          <button onClick={generate} disabled={loading || !fromA || !toA || !fromB || !toB}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors mt-auto">
            {loading ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"/> : null}
            {loading ? 'Comparing…' : 'Compare'}
          </button>
        </div>
      </div>

      {/* Results */}
      {generated && (
        <>
          {/* Metric tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
            {METRICS.map(m => (
              <button key={m.key} onClick={() => setActiveMetric(m.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeMetric === m.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500"/><span className="text-gray-600 font-medium">{dataA.label}</span><span className="text-gray-400">({fromA} → {toA})</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400"/><span className="text-gray-600 font-medium">{dataB.label}</span><span className="text-gray-400">({fromB} → {toB})</span></div>
          </div>

          {/* ── SALES ── */}
          {activeMetric === 'sales' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPI label="Total Transactions" a={dataA.totalTxn} b={dataB.totalTxn} dec={0}/>
                <KPI label="Total Revenue (KWD)" a={dataA.totalSales} b={dataB.totalSales} prefix="KWD "/>
                <KPI label="Avg Ticket Size" a={dataA.totalTxn > 0 ? dataA.totalSales/dataA.totalTxn : 0} b={dataB.totalTxn > 0 ? dataB.totalSales/dataB.totalTxn : 0} prefix="KWD " dec={3}/>
                <KPI label="Revenue per Day" a={dataA.dailySales.length > 0 ? dataA.totalSales/dataA.dailySales.length : 0} b={dataB.dailySales.length > 0 ? dataB.totalSales/dataB.dailySales.length : 0} prefix="KWD "/>
              </div>

              {/* Daily sales chart */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Daily Revenue Comparison</p>
                </div>
                <div className="p-4 overflow-x-auto">
                  <div className="flex items-end gap-1" style={{ minWidth: Math.max(dataA.dailySales.length, dataB.dailySales.length) * 24 }}>
                    {Array.from({ length: Math.max(dataA.dailySales.length, dataB.dailySales.length) }).map((_, i) => {
                      const a = dataA.dailySales[i]?.sales || 0
                      const b = dataB.dailySales[i]?.sales || 0
                      const maxV = Math.max(...dataA.dailySales.map(d => d.sales), ...dataB.dailySales.map(d => d.sales), 1)
                      return (
                        <div key={i} className="flex gap-0.5 items-end">
                          <div className="w-2 bg-blue-400 rounded-t" style={{ height: `${(a/maxV)*80}px` }} title={`A: ${a.toFixed(2)}`}/>
                          <div className="w-2 bg-amber-300 rounded-t" style={{ height: `${(b/maxV)*80}px` }} title={`B: ${b.toFixed(2)}`}/>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Each pair = one day · Blue = {dataA.label} · Amber = {dataB.label}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── DELIVERY ── */}
          {activeMetric === 'delivery' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPI label="Delivery Transactions" a={dataA.deliveryTxn} b={dataB.deliveryTxn} dec={0}/>
                <KPI label="Delivery Sales (KWD)" a={dataA.deliverySales} b={dataB.deliverySales} prefix="KWD "/>
                <KPI label="Dine-in Transactions" a={dataA.dineInTxn} b={dataB.dineInTxn} dec={0}/>
                <KPI label="Dine-in Sales (KWD)" a={dataA.dineInSales} b={dataB.dineInSales} prefix="KWD "/>
              </div>

              {/* Split pie-like bars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: dataA.label, sales: dataA.totalSales, delivery: dataA.deliverySales, dineIn: dataA.dineInSales, color: 'bg-blue-500' },
                  { label: dataB.label, sales: dataB.totalSales, delivery: dataB.deliverySales, dineIn: dataB.dineInSales, color: 'bg-amber-400' },
                ].map((p, i) => {
                  const delPct = p.sales > 0 ? (p.delivery / p.sales * 100) : 0
                  const dinePct = p.sales > 0 ? (p.dineIn / p.sales * 100) : 0
                  return (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <p className="text-sm font-semibold text-gray-700 mb-3">{p.label} — Sales Split</p>
                      <div className="flex rounded-full overflow-hidden h-5 mb-3">
                        <div className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium transition-all" style={{ width: `${delPct}%` }}>
                          {delPct > 15 ? `${delPct.toFixed(0)}%` : ''}
                        </div>
                        <div className="bg-green-400 flex items-center justify-center text-white text-xs font-medium transition-all" style={{ width: `${dinePct}%` }}>
                          {dinePct > 15 ? `${dinePct.toFixed(0)}%` : ''}
                        </div>
                      </div>
                      <div className="flex justify-between text-xs">
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"/>Delivery: KWD {fmt(p.delivery)} ({delPct.toFixed(1)}%)</div>
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400"/>Dine-in: KWD {fmt(p.dineIn)} ({dinePct.toFixed(1)}%)</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── PRODUCT MIX ── */}
          {activeMetric === 'pmix' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
                {[{ d: dataA }, { d: dataB }].map(({ d }, i) => (
                  <div key={i} className={`bg-white border rounded-xl shadow-sm overflow-hidden ${i === 0 ? 'border-blue-200' : 'border-amber-200'}`}>
                    <div className={`px-4 py-2.5 border-b ${i === 0 ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
                      <p className="text-sm font-semibold text-gray-700">{d.label} — Top 10 Items</p>
                    </div>
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Item</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">Qty</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.topItems.map((item, j) => {
                          const maxQ = d.topItems[0]?.qty || 1
                          return (
                            <tr key={j} className="border-t border-gray-50">
                              <td className="px-3 py-1.5">
                                <p className="font-medium text-gray-700 truncate max-w-[160px]">{item.name}</p>
                                <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                                  <div className={`h-1 rounded-full ${i === 0 ? 'bg-blue-400' : 'bg-amber-400'}`} style={{ width: `${(item.qty/maxQ)*100}%` }}/>
                                </div>
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono">{item.qty.toFixed(0)}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{item.revenue.toFixed(2)}</td>
                            </tr>
                          )
                        })}
                        {d.topItems.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">No data</td></tr>}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              {/* Side by side comparison table */}
              {dataA.topItems.length > 0 && dataB.topItems.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-700">Item-by-Item Comparison</p>
                  </div>
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2.5 font-medium text-gray-500">Item</th>
                          <th className="text-right px-3 py-2.5 font-medium text-blue-600">{dataA.label} Qty</th>
                          <th className="text-right px-3 py-2.5 font-medium text-amber-600">{dataB.label} Qty</th>
                          <th className="text-right px-3 py-2.5 font-medium text-gray-500">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dataA.topItems.map((item, i) => {
                          const bItem = dataB.topItems.find(b => b.name === item.name)
                          const bQty = bItem?.qty || 0
                          const diff = pct(item.qty, bQty)
                          return (
                            <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium text-gray-700 truncate max-w-[200px]">{item.name}</td>
                              <td className="px-3 py-2 text-right font-mono text-blue-700">{item.qty.toFixed(0)}</td>
                              <td className="px-3 py-2 text-right font-mono text-amber-600">{bQty.toFixed(0)}</td>
                              <td className="px-3 py-2 text-right">{arrow(diff)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── INVENTORY ── */}
          {activeMetric === 'inventory' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KPI label="Total Consumption" a={dataA.totalConsumption} b={dataB.totalConsumption} dec={1}/>
                <KPI label="Total Wastage" a={dataA.totalWastage} b={dataB.totalWastage} dec={1} invert/>
                <KPI label="Wastage Rate %" a={dataA.totalConsumption > 0 ? dataA.totalWastage/dataA.totalConsumption*100 : 0} b={dataB.totalConsumption > 0 ? dataB.totalWastage/dataB.totalConsumption*100 : 0} suffix="%" invert dec={2}/>
                <KPI label="Avg Daily Consumption" a={dataA.dailySales.length > 0 ? dataA.totalConsumption/dataA.dailySales.length : 0} b={dataB.dailySales.length > 0 ? dataB.totalConsumption/dataB.dailySales.length : 0} dec={1}/>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[{ d: dataA }, { d: dataB }].map(({ d }, i) => (
                  <div key={i} className={`bg-white border rounded-xl shadow-sm overflow-hidden ${i === 0 ? 'border-blue-200' : 'border-amber-200'}`}>
                    <div className={`px-4 py-2.5 border-b ${i === 0 ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
                      <p className="text-sm font-semibold text-gray-700">{d.label} — Top Wastage Items</p>
                    </div>
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Item</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">Qty</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">Cost (KWD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.topWasted.map((item, j) => (
                          <tr key={j} className="border-t border-gray-50">
                            <td className="px-3 py-1.5 font-medium text-gray-700 truncate max-w-[160px]">{item.name}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{item.qty.toFixed(2)}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-red-500">{item.cost.toFixed(3)}</td>
                          </tr>
                        ))}
                        {d.topWasted.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">No wastage data</td></tr>}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── FOOD COST ── */}
          {activeMetric === 'foodcost' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <KPI label="Total Revenue (KWD)" a={dataA.totalSales} b={dataB.totalSales} prefix="KWD "/>
                <KPI label="Total Consumption" a={dataA.totalConsumption} b={dataB.totalConsumption} dec={1}/>
                <KPI label="Total Wastage" a={dataA.totalWastage} b={dataB.totalWastage} dec={1} invert/>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <p className="text-sm font-semibold text-gray-700 mb-4">Consumption vs Wastage Breakdown</p>
                <div className="flex flex-col gap-4">
                  {[
                    { label: dataA.label, cons: dataA.totalConsumption, waste: dataA.totalWastage, color: 'blue' },
                    { label: dataB.label, cons: dataB.totalConsumption, waste: dataB.totalWastage, color: 'amber' },
                  ].map((p, i) => {
                    const maxV = Math.max(dataA.totalConsumption, dataB.totalConsumption, 1)
                    const wastePct = p.cons > 0 ? (p.waste / p.cons * 100) : 0
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${p.color === 'blue' ? 'bg-blue-500' : 'bg-amber-400'}`}/>
                            <span className="text-sm font-medium text-gray-700">{p.label}</span>
                          </div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${wastePct > 5 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                            Waste: {wastePct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex gap-1 h-5 rounded-full overflow-hidden">
                          <div className={`${p.color === 'blue' ? 'bg-blue-400' : 'bg-amber-300'} transition-all`}
                            style={{ width: `${((p.cons - p.waste) / maxV * 100)}%` }} title="Consumption"/>
                          <div className="bg-red-400 transition-all"
                            style={{ width: `${(p.waste / maxV * 100)}%` }} title="Wastage"/>
                        </div>
                        <div className="flex gap-4 mt-1 text-xs text-gray-500">
                          <span>Consumption: {p.cons.toFixed(1)}</span>
                          <span className="text-red-500">Wastage: {p.waste.toFixed(1)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── RESTAURANT VS RESTAURANT ── */}
          {activeMetric === 'restaurant' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[{ d: dataA }, { d: dataB }].map(({ d }, pi) => (
                  <div key={pi} className={`bg-white border rounded-xl shadow-sm overflow-hidden ${pi === 0 ? 'border-blue-200' : 'border-amber-200'}`}>
                    <div className={`px-4 py-2.5 border-b ${pi === 0 ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
                      <p className="text-sm font-semibold text-gray-700">{d.label} — By Restaurant</p>
                    </div>
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2.5 font-medium text-gray-500">Restaurant</th>
                          <th className="text-right px-3 py-2.5 font-medium text-gray-500">Transactions</th>
                          <th className="text-right px-3 py-2.5 font-medium text-gray-500">Sales (KWD)</th>
                          <th className="text-right px-3 py-2.5 font-medium text-gray-500">Delivery</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.byRestaurant.map((r, i) => {
                          const maxS = d.byRestaurant[0]?.sales || 1
                          const shortName = r.name.split(' - ')[2] || r.name.slice(0, 20)
                          return (
                            <tr key={i} className="border-t border-gray-50">
                              <td className="px-3 py-2">
                                <p className="font-medium text-gray-700">{shortName}</p>
                                <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                                  <div className={`h-1 rounded-full ${pi === 0 ? 'bg-blue-400' : 'bg-amber-400'}`} style={{ width: `${(r.sales/maxS)*100}%` }}/>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right font-mono">{r.txn.toFixed(0)}</td>
                              <td className="px-3 py-2 text-right font-mono font-medium">{r.sales.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-mono text-blue-600">{r.delivery.toFixed(2)}</td>
                            </tr>
                          )
                        })}
                        {d.byRestaurant.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No data</td></tr>}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              {/* Restaurant comparison table */}
              {dataA.byRestaurant.length > 0 && dataB.byRestaurant.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-700">Restaurant Performance Change</p>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2.5 font-medium text-gray-500">Restaurant</th>
                        <th className="text-right px-3 py-2.5 font-medium text-blue-600">{dataA.label}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-amber-600">{dataB.label}</th>
                        <th className="text-right px-3 py-2.5 font-medium text-gray-500">Sales Change</th>
                        <th className="text-right px-3 py-2.5 font-medium text-gray-500">Txn Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataA.byRestaurant.map((r, i) => {
                        const bR = dataB.byRestaurant.find(b => b.name === r.name)
                        const salesDiff = pct(r.sales, bR?.sales || 0)
                        const txnDiff = pct(r.txn, bR?.txn || 0)
                        const shortName = r.name.split(' - ')[2] || r.name.slice(0, 20)
                        return (
                          <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                            <td className="px-3 py-2.5 font-medium text-gray-700">{shortName}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-blue-700">{r.sales.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-amber-600">{(bR?.sales || 0).toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-right">{arrow(salesDiff)}</td>
                            <td className="px-3 py-2.5 text-right">{arrow(txnDiff)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!generated && (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center shadow-sm">
          <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" viewBox="0 0 24 24">
              <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
          </div>
          <p className="font-medium text-gray-700">Set two date ranges and click Compare</p>
          <p className="text-sm text-gray-400 mt-1">Compare any two periods across sales, delivery, product mix, inventory and more</p>
        </div>
      )}
    </div>
  )
}
