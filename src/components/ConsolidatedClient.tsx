'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SECTIONS = [
  { key:'hourly_txn', label:'Hourly Transactions' },
  { key:'hourly_amt', label:'Hourly Sales (KWD)' },
  { key:'deliv_txn',  label:'Delivery Transactions' },
  { key:'deliv_amt',  label:'Delivery Sales (KWD)' },
  { key:'pmix_qty',   label:'Product Mix (Qty)' },
  { key:'pmix_amt',   label:'Product Mix (Amount)' },
  { key:'meal_cnt',   label:'Meal Count' },
  { key:'meal_qty',   label:'Meal Qty' },
  { key:'meal_amt',   label:'Meal Amount (KWD)' },
  { key:'cons_qty',   label:'Consumption (Qty)' },
  { key:'waste_qty',  label:'Wastage (Qty)' },
  { key:'var_qty',    label:'Variance (Qty)' },
]

export default function ConsolidatedClient() {
  const supabase = createClient()
  const [restaurants, setRestaurants] = useState<string[]>([])
  const [selectedRestaurant, setSelectedRestaurant] = useState('all')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [activeSection, setActiveSection] = useState('hourly_txn')
  const [activeTab, setActiveTab] = useState('all')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    supabase.from('restaurants').select('name').eq('active', true).order('name')
      .then(({ data }) => setRestaurants(data?.map((r: any) => r.name) ?? []))
  }, [])

  async function generate() {
    setLoading(true)
    const res = await fetch(`/api/consolidated?year=${year}&month=${month}&restaurant=${encodeURIComponent(selectedRestaurant)}`)
    const json = await res.json()
    setData(json)
    // Set Total as default active tab
    setActiveTab('__total__')
    setLoading(false)
  }

  async function downloadExcel() {
    if (!data) return
    setDownloading(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const meta = data.meta
      const days = meta.days as number[]
      const rests = Object.keys(data).filter(k => k !== 'meta')

      // Helper: build section rows
      const buildSection = (rows: any[], labelKey: string, sectionLabel: string, isInv = false) => {
        const header = isInv
          ? [sectionLabel, 'Code', 'Item Name', 'Unit', ...days, 'Sum', 'Average']
          : [sectionLabel, 'Label', ...days, 'Sum', 'Average']
        const result = [header]
        rows.forEach((row: any) => {
          const label = row[labelKey] || row.hour || ''
          const parts = label.split('||')
          const code = parts[0] || ''
          const displayLabel = parts[1] || label
          const unit = parts[2] || ''
          const vals = days.map((d: number) => row.days[d] || 0)
          const sum = vals.reduce((a: number, b: number) => a + b, 0)
          const nonZero = vals.filter((v: number) => v > 0).length
          const avg = nonZero > 0 ? sum / nonZero : 0
          if (isInv) {
            result.push(['', code, displayLabel, unit, ...vals, sum, parseFloat(avg.toFixed(3))])
          } else {
            result.push(['', displayLabel, ...vals, sum, parseFloat(avg.toFixed(3))])
          }
        })
        return result
      }

      // Create sheet for each restaurant
      for (const rest of rests) {
        const rd = data[rest]
        const shortName = rest.split(' - ')[2] || rest.slice(0, 20)
        const rows: any[] = []

        // Day headers
        rows.push(['', '', ...days.map((d: number) => {
          const date = new Date(meta.year, meta.month - 1, d)
          return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()]
        })])
        rows.push(['', '', ...days, 'Sum', 'Avg'])

        const sections = [
          ['hourly_txn', 'Hourly Transactions', 'hour', false],
          ['hourly_amt', 'Hourly Sales (KWD)', 'hour', false],
          ['deliv_txn',  'Delivery Transactions', 'hour', false],
          ['deliv_amt',  'Delivery Sales (KWD)', 'hour', false],
          ['pmix_qty',   'Product Mix Qty (Menu Mix)', 'key', false],
          ['pmix_amt',   'Product Mix Amount (KWD)', 'key', false],
          ['meal_cnt',   'Meal Count', 'key', false],
          ['meal_qty',   'Meal Quantity', 'key', false],
          ['meal_amt',   'Meal Amount (KWD)', 'key', false],
          ['cons_qty',   'Consumption Qty', 'key', true],
          ['waste_qty',  'Wastage Qty', 'key', true],
          ['var_qty',    'Variance Qty', 'key', true],
        ]

        for (const [sKey, sLabel, lKey, isInv] of sections) {
          rows.push([])
          const sectionRows = buildSection(rd[sKey] || [], lKey as string, sLabel as string, isInv as boolean)
          rows.push(...sectionRows)
          // Totals row
          if (rd[sKey]?.length > 0) {
            const totals = days.map((d: number) =>
              rd[sKey].reduce((sum: number, row: any) => sum + (row.days[d] || 0), 0)
            )
            const grandSum = totals.reduce((a: number, b: number) => a + b, 0)
            const nonZero = totals.filter((v: number) => v > 0).length
            if (isInv) {
              rows.push(['', '', 'TOTAL', '', ...totals, grandSum, parseFloat((nonZero > 0 ? grandSum / nonZero : 0).toFixed(3))])
            } else {
              rows.push(['', 'TOTAL', ...totals, grandSum, parseFloat((nonZero > 0 ? grandSum / nonZero : 0).toFixed(3))])
            }
          }
        }

        const ws = XLSX.utils.aoa_to_sheet(rows)
        // Style column widths
        ws['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 35 }, { wch: 10 }, ...days.map(() => ({ wch: 8 })), { wch: 10 }, { wch: 10 }]
        XLSX.utils.book_append_sheet(wb, ws, shortName.slice(0, 31))
      }

      // Summary sheet — all restaurants side by side for key metrics
      if (rests.length > 1) {
        const summaryRows: any[] = []
        summaryRows.push([`Consolidated Summary — ${MONTHS[meta.month-1]} ${meta.year}`])
        summaryRows.push([])

        const metrics = [
          ['hourly_txn', 'Total Daily Transactions'],
          ['hourly_amt', 'Total Daily Sales (KWD)'],
          ['deliv_txn',  'Total Delivery Transactions'],
          ['deliv_amt',  'Total Delivery Sales (KWD)'],
        ]

        for (const [sKey, mLabel] of metrics) {
          summaryRows.push([mLabel])
          summaryRows.push(['Restaurant', ...days, 'Month Total'])
          for (const rest of rests) {
            const rd = data[rest]
            if (!rd[sKey]) continue
            const shortName = rest.split(' - ')[2] || rest.slice(0, 20)
            const dayTotals = days.map((d: number) =>
              (rd[sKey] || []).reduce((sum: number, row: any) => sum + (row.days[d] || 0), 0)
            )
            const total = dayTotals.reduce((a: number, b: number) => a + b, 0)
            summaryRows.push([shortName, ...dayTotals, parseFloat(total.toFixed(3))])
          }
          summaryRows.push([])
        }

        const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows)
        summaryWs['!cols'] = [{ wch: 30 }, ...days.map(() => ({ wch: 8 })), { wch: 12 }]
        XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')
        // Move summary to first position
        wb.SheetNames = ['Summary', ...wb.SheetNames.filter(s => s !== 'Summary')]
      }

      const filename = `Consolidated_${MONTHS[meta.month-1]}_${meta.year}.xlsx`
      XLSX.writeFile(wb, filename)
    } catch (e) {
      console.error(e)
    }
    setDownloading(false)
  }

  // Merge all restaurant data into one for total tab
  const getTotalData = (data: any, rests: string[]) => {
    if (!rests.length) return null
    const result: any = {}
    const sectionKeys = ['hourly_txn','hourly_amt','deliv_txn','deliv_amt','pmix_qty','pmix_amt','meal_cnt','meal_qty','meal_amt','cons_qty','waste_qty','var_qty']
    sectionKeys.forEach(sKey => {
      const merged: Record<string, Record<number, number>> = {}
      rests.forEach(rest => {
        const section = data[rest]?.[sKey] || []
        section.forEach((row: any) => {
          const key = row.hour || row.key || ''
          if (!merged[key]) merged[key] = {}
          Object.entries(row.days).forEach(([d, v]: any) => {
            merged[key][d] = (merged[key][d] || 0) + (v || 0)
          })
        })
      })
      result[sKey] = Object.entries(merged).map(([k, days]) => ({
        hour: k, key: k, days
      }))
    })
    return result
  }

  // Render current section table
  function renderTable() {
    if (!data) return null
    const rd = activeTab === '__total__' ? getTotalData(data, restTabs) : data[activeTab]
    if (!rd) return null
    const section = rd[activeSection] || []
    if (!section.length) return <p className="text-sm text-gray-400 text-center py-8">No data for this section</p>
    const days = data.meta.days as number[]
    const isHour = activeSection.startsWith('hourly') || activeSection.startsWith('deliv')
    const isInv = ['cons_qty','waste_qty','var_qty'].includes(activeSection)
    const labelKey = isHour ? 'hour' : 'key'

    return (
      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse" style={{minWidth: isInv ? 1000 : 800}}>
          <thead>
            <tr className="bg-gray-50">
              {isInv && <th className="text-left px-3 py-2 border border-gray-200 sticky left-0 bg-gray-50 min-w-[90px]">Code</th>}
              <th className="text-left px-3 py-2 border border-gray-200 sticky left-0 bg-gray-50 min-w-[200px]">
                {isHour ? 'Hour' : 'Item'}
              </th>
              {isInv && <th className="text-left px-2 py-2 border border-gray-200 bg-gray-50 min-w-[60px]">Unit</th>}
              {days.map(d => {
                const date = new Date(data.meta.year, data.meta.month - 1, d)
                const dayName = ['Su','Mo','Tu','We','Th','Fr','Sa'][date.getDay()]
                return (
                  <th key={d} className="px-2 py-1 border border-gray-200 text-center font-medium min-w-[42px]">
                    <div className="text-gray-400 font-normal" style={{fontSize:9}}>{dayName}</div>
                    <div>{d}</div>
                  </th>
                )
              })}
              <th className="px-2 py-2 border border-gray-200 text-center bg-blue-50 text-blue-700 min-w-[60px]">Sum</th>
              <th className="px-2 py-2 border border-gray-200 text-center bg-blue-50 text-blue-700 min-w-[60px]">Avg</th>
            </tr>
          </thead>
          <tbody>
            {section.map((row: any, i: number) => {
              const label = row[labelKey] || ''
              const parts = label.split('||')
              const displayCode = parts[0] || ''
              const displayLabel = parts[1] || label
              const displayUnit = parts[2] || ''
              const vals = days.map((d: number) => row.days[d] || 0)
              const sum = vals.reduce((a: number, b: number) => a + b, 0)
              const nonZero = vals.filter((v: number) => v > 0).length
              const avg = nonZero > 0 ? sum / nonZero : 0
              const isAmt = activeSection.includes('amt') || activeSection.includes('amount')
              const fmt = (v: number) => isAmt ? v.toFixed(3) : v || ''
              return (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {isInv && <td className="px-2 py-1.5 border border-gray-200 sticky left-0 bg-inherit font-mono text-gray-500 text-xs">{displayCode}</td>}
                  <td className="px-3 py-1.5 border border-gray-200 sticky left-0 bg-inherit font-medium text-gray-700 truncate max-w-[200px]">{displayLabel}</td>
                  {isInv && <td className="px-2 py-1.5 border border-gray-200 text-gray-400 text-xs">{displayUnit}</td>}
                  {vals.map((v: number, j: number) => (
                    <td key={j} className={`px-2 py-1.5 border border-gray-200 text-center ${v > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                      {fmt(v)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 border border-gray-200 text-center font-semibold text-blue-700 bg-blue-50">{isAmt ? sum.toFixed(3) : sum}</td>
                  <td className="px-2 py-1.5 border border-gray-200 text-center text-blue-600 bg-blue-50">{isAmt ? avg.toFixed(3) : avg.toFixed(1)}</td>
                </tr>
              )
            })}
            {/* Totals row */}
            <tr className="bg-gray-800 text-white font-semibold">
              {isInv && <td className="px-2 py-2 bg-gray-800"></td>}
              <td className="px-3 py-2 sticky left-0 bg-gray-800">TOTAL</td>
              {isInv && <td className="px-2 py-2 bg-gray-800"></td>}
              {days.map((d: number) => {
                const total = section.reduce((sum: number, row: any) => sum + (row.days[d] || 0), 0)
                const isAmt = activeSection.includes('amt')
                return <td key={d} className="px-2 py-2 text-center text-xs">{isAmt ? total.toFixed(1) : total || ''}</td>
              })}
              <td className="px-2 py-2 text-center bg-blue-800">
                {section.reduce((sum: number, row: any) =>
                  sum + days.reduce((s: number, d: number) => s + (row.days[d] || 0), 0), 0
                ).toFixed(activeSection.includes('amt') ? 1 : 0)}
              </td>
              <td className="px-2 py-2 text-center bg-blue-800">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  const restTabs = data ? Object.keys(data).filter(k => k !== 'meta') : []

  return (
    <div className="flex flex-col gap-5 max-w-full">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Consolidated Report</h1>
        <p className="text-sm text-gray-500 mt-0.5">Monthly consolidated view across all restaurants — interactive dashboard + Excel download.</p>
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Year</label>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Month</label>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Restaurant</label>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={selectedRestaurant} onChange={e => setSelectedRestaurant(e.target.value)}>
            <option value="all">All Restaurants</option>
            {restaurants.map(r => <option key={r} value={r}>{r.split(' - ')[2] || r}</option>)}
          </select>
        </div>
        <button onClick={generate} disabled={loading}
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
          {loading ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"/> : null}
          {loading ? 'Generating…' : 'Generate Report'}
        </button>
        {data && (
          <button onClick={downloadExcel} disabled={downloading}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors ml-auto">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16">
              <path d="M8 1v10M5 8l3 3 3-3M2 13h12"/>
            </svg>
            {downloading ? 'Preparing…' : 'Download Excel'}
          </button>
        )}
      </div>

      {/* Report */}
      {data && (
        <>
          {/* Restaurant tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
            <button onClick={() => setActiveTab('__total__')}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeTab === '__total__' ? 'bg-blue-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              ∑ Total
            </button>
            {restTabs.map(rest => {
              const shortName = rest.split(' - ')[2] || rest.slice(0, 16)
              return (
                <button key={rest} onClick={() => setActiveTab(rest)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeTab === rest ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {shortName}
                </button>
              )
            })}
          </div>

          {/* Section tabs */}
          <div className="flex gap-1 flex-wrap">
            {SECTIONS.map(s => (
              <button key={s.key} onClick={() => setActiveSection(s.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${activeSection === s.key ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Summary KPIs */}
          {(data[activeTab] || activeTab === '__total__') && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(() => {
                const tabData = activeTab === '__total__' ? getTotalData(data, restTabs) : data[activeTab]
                const kpis = [
                  { label:'Total Transactions', val: (tabData?.hourly_txn||[]).reduce((s:number,r:any) => s + (Object.values(r.days) as number[]).reduce((a:number,b:number)=>a+b,0), 0) },
                  { label:'Total Sales (KWD)',  val: (tabData?.hourly_amt||[]).reduce((s:number,r:any) => s + (Object.values(r.days) as number[]).reduce((a:number,b:number)=>a+b,0), 0) },
                  { label:'Delivery Sales',     val: (tabData?.deliv_amt||[]).reduce((s:number,r:any) => s + (Object.values(r.days) as number[]).reduce((a:number,b:number)=>a+b,0), 0) },
                  { label:'Total Wastage',      val: (tabData?.waste_qty||[]).reduce((s:number,r:any) => s + (Object.values(r.days) as number[]).reduce((a:number,b:number)=>a+b,0), 0) },
                ]
                return kpis.map((kpi, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{kpi.label}</p>
                    <p className="text-lg font-semibold font-mono text-gray-900">
                      {typeof kpi.val === 'number' ? kpi.val.toFixed(kpi.label.includes('KWD')||kpi.label.includes('Sales')||kpi.label.includes('Wastage') ? 2 : 0) : kpi.val}
                    </p>
                  </div>
                ))
              })()}
            </div>
          )}

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">
                {SECTIONS.find(s=>s.key===activeSection)?.label} — {MONTHS[month-1]} {year}
              </p>
              <span className="text-xs text-gray-400">{activeTab === '__total__' ? 'All Restaurants Combined' : (activeTab.split(' - ')[2] || activeTab)}</span>
            </div>
            {renderTable()}
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center shadow-sm">
          <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" strokeLinecap="round">
              <path d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V7l-5-5H5a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
          </div>
          <p className="font-medium text-gray-700">Select year, month and restaurant</p>
          <p className="text-sm text-gray-400 mt-1">Then click Generate Report to build your consolidated view</p>
        </div>
      )}
    </div>
  )
}
