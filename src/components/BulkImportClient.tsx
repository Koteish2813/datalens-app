'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import * as XLSX from 'xlsx'

// Sheet name decoding
// Format: {day}{restaurant_code}{report_type}
// restaurant: j=Al Jahra, a=Avenues, k=Al Khiran
// report: s=hourly sales, sd=delivery sales, ma/mj/mk=meal count, ap/jp/kp=menu mix, av/jv/kv=inventory

const RESTAURANT_MAP: Record<string, string> = {
  j: 'ALBAIK - BY JH01 - Al JAHRA - 1007001',
  a: 'ALBAIK - BY KW01 - AVENUES - 1007002',
  k: 'ALBAIK - BY AH01 - AL KHIRAN MALL - 1007003',
}

function decodeSheet(sheetName: string): { day: number; restaurant: string; type: string } | null {
  const m = sheetName.match(/^(\d+)([jak])(.+)$/)
  if (!m) return null
  const day = parseInt(m[1])
  const restCode = m[2]
  const typeCode = m[3]
  const restaurant = RESTAURANT_MAP[restCode]
  if (!restaurant) return null

  let type = ''
  if (typeCode === 's') type = 'hourly_sales'
  else if (typeCode === 'sd') type = 'delivery_sales'
  else if (typeCode === 'ma' || typeCode === 'mj' || typeCode === 'mk') type = 'meal_count'
  else if (typeCode === 'ap' || typeCode === 'jp' || typeCode === 'kp') type = 'menu_mix'
  else if (typeCode === 'av' || typeCode === 'jv' || typeCode === 'kv') type = 'inventory'
  else return null

  return { day, restaurant, type }
}

function parseSheetData(ws: any, type: string, restaurant: string, date: string): any[] {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
  const rows: any[] = []

  if (type === 'hourly_sales') {
    let headerRow = -1
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]) === 'Hour') { headerRow = i; break }
    }
    if (headerRow === -1) return rows
    for (let i = headerRow + 2; i < data.length; i++) {
      const r = data[i]
      if (!r[0] || String(r[0]).includes('Total') || String(r[0]).includes('Amount')) continue
      rows.push({
        restaurant_name: restaurant, date,
        hour: String(r[0]).trim(),
        no_of_tickets: Number(r[1]) || 0,
        covers: Number(r[2]) || 0,
        charges: Number(r[3]) || 0,
        subtotal: Number(r[4]) || 0,
        discount: Number(r[5]) || 0,
        net_sales: Number(r[6]) || 0,
        gross_sales: Number(r[7]) || 0,
        apt: Number(r[8]) || 0,
      })
    }
  }

  else if (type === 'delivery_sales') {
    let headerRow = -1
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][1]) === 'Hour' || String(data[i][0]) === 'Date') { headerRow = i; break }
    }
    if (headerRow === -1) return rows
    for (let i = headerRow + 1; i < data.length; i++) {
      const r = data[i]
      if (!r[1] || String(r[1]).includes('Total')) continue
      rows.push({
        restaurant_name: restaurant, date,
        hour: String(r[1]).trim(),
        platform: String(r[2]).trim(),
        number_of_bills: Number(r[3]) || 0,
        covers: Number(r[4]) || 0,
        charges: Number(r[5]) || 0,
        subtotal: Number(r[6]) || 0,
        discount: Number(r[7]) || 0,
        net_sales: Number(r[8]) || 0,
        gross_sales: Number(r[9]) || 0,
        apt: Number(r[10]) || 0,
      })
    }
  }

  else if (type === 'meal_count') {
    let headerRow = -1
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][2]) === 'Item Code') { headerRow = i; break }
    }
    if (headerRow === -1) return rows
    for (let i = headerRow + 1; i < data.length; i++) {
      const r = data[i]
      if (!r[2] || isNaN(Number(r[2]))) continue
      rows.push({
        restaurant_name: restaurant, date,
        super_category: String(r[0]).trim(),
        category: String(r[1]).trim(),
        item_code: String(r[2]).trim(),
        item_name: String(r[3]).trim(),
        item_rate: Number(r[4]) || 0,
        item_quantity: Number(r[5]) || 0,
        combo_constituent_qty: Number(r[6]) || 0,
        total_quantity: Number(r[7]) || 0,
        portion_value: Number(r[8]) || 0,
        meal_count: Number(r[9]) || 0,
        total_price: (Number(r[7]) || 0) * (Number(r[4]) || 0),
      })
    }
  }

  else if (type === 'menu_mix') {
    let headerRow = -1
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]) === 'SCategory') { headerRow = i; break }
    }
    if (headerRow === -1) return rows
    let currentCat = ''
    for (let i = headerRow + 1; i < data.length; i++) {
      const r = data[i]
      const col0 = String(r[0] ?? '').trim()
      const col1 = r[1]
      // Category header row: col0 has text, col1 is empty
      if (col0 && (col1 === '' || col1 === null || col1 === undefined)) {
        if (!col0.includes('Total')) currentCat = col0
        continue
      }
      // Data row: col1 must be a real number (item code)
      const itemCode = Number(col1)
      if (!col1 || col1 === '' || isNaN(itemCode) || itemCode === 0) continue
      rows.push({
        restaurant_name: restaurant, date,
        scategory: currentCat,
        item_number: String(col1).trim(),
        item_name: String(r[2] ?? '').trim(),
        comp_qty: Number(r[3]) || 0,
        non_comp_qty: Number(r[4]) || 0,
        number_sold: Number(r[5]) || 0,
        price_sold: Number(r[6]) || 0,
        amount: Number(r[7]) || 0,
        comp_amount: Number(r[8]) || 0,
        discount_amount: Number(r[9]) || 0,
      })
    }
  }

  else if (type === 'inventory') {
    // Structure: Row 1 = 'INNER TABLE', Row 2 = headers, Row 3+ = data
    // Find header row (contains 'Item Code')
    let headerRow = -1
    for (let i = 0; i < Math.min(data.length, 5); i++) {
      if (String(data[i][0]) === 'Item Code') { headerRow = i; break }
    }
    if (headerRow === -1) return rows
    for (let i = headerRow + 1; i < data.length; i++) {
      const r = data[i]
      // Skip non-data rows: empty, 'Amount -' totals, non-numeric codes
      if (!r[0] && r[0] !== 0) continue
      const code = String(r[0]).trim()
      if (code === '' || code.startsWith('Amount') || code === 'Item Code') continue
      const codeNum = Number(code)
      if (isNaN(codeNum) || codeNum === 0) continue
      rows.push({
        restaurant_name: restaurant,
        date,  // Use the sheet date (day of month), NOT latest_physical
        item_code: code,
        item_name: String(r[1] || '').trim(),
        unit: String(r[2] || '').trim(),
        category: String(r[3] || '').trim(),
        average_price: Number(r[4]) || 0,
        opening: Number(r[5]) || 0,
        purchase: Number(r[7]) || 0,
        consumption: Number(r[11]) || 0,
        wastage: Number(r[15]) || 0,
        closing: Number(r[21]) || 0,
        variance: r[26] != null && r[26] !== '-' ? Number(r[26]) : null,
        variance_pct: r[28] != null && r[28] !== '-' ? Number(r[28]) : null,
        actual_consumption: Number(r[31]) || 0,
      })
    }
  }

  return rows
}

const TABLE_MAP: Record<string, string> = {
  hourly_sales: 'hourly_sales',
  delivery_sales: 'delivery_sales',
  meal_count: 'meal_count',
  menu_mix: 'menu_mix',
  inventory: 'inventory',
}

const TYPE_LABELS: Record<string, string> = {
  hourly_sales: 'Hourly Sales',
  delivery_sales: 'Delivery Sales',
  meal_count: 'Meal Count',
  menu_mix: 'Menu Mix',
  inventory: 'Inventory',
}

interface SheetResult {
  sheet: string
  day: number
  restaurant: string
  type: string
  date: string
  rows: number
  status: 'pending' | 'uploading' | 'done' | 'error' | 'skipped'
  error?: string
}

export default function BulkImportClient() {
  const supabase = createClient()
  const [results, setResults] = useState<SheetResult[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<{ done: number; skipped: number; errors: number; rows: number } | null>(null)
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(3)
  const [filterType, setFilterType] = useState('all')
  const fileRef = useRef<HTMLInputElement>(null)

  async function processFile(file: File) {
    setRunning(true)
    setResults([])
    setSummary(null)
    setProgress(0)

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })

    // Parse all sheets
    const allSheets: SheetResult[] = []
    for (const sheetName of wb.SheetNames) {
      const decoded = decodeSheet(sheetName)
      if (!decoded) continue
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(decoded.day).padStart(2,'0')}`
      allSheets.push({
        sheet: sheetName,
        day: decoded.day,
        restaurant: decoded.restaurant,
        type: decoded.type,
        date: dateStr,
        rows: 0,
        status: 'pending',
      })
    }

    setTotal(allSheets.length)
    setResults([...allSheets])

    const { data: { user } } = await supabase.auth.getUser()

    let done = 0, skipped = 0, errors = 0, totalRows = 0

    for (let i = 0; i < allSheets.length; i++) {
      const sheet = allSheets[i]

      // Update status to uploading
      setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'uploading' } : r))

      try {
        const ws = wb.Sheets[sheet.sheet]
        const rows = parseSheetData(ws, sheet.type, sheet.restaurant, sheet.date)

        if (rows.length === 0) {
          allSheets[i] = { ...sheet, status: 'skipped', rows: 0 }
          setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'skipped', rows: 0 } : r))
          skipped++
        } else {
          const table = TABLE_MAP[sheet.type]
          const rowsWithUser = rows.map(r => ({ ...r, uploaded_by: user?.id }))

          // First delete existing data for this date/restaurant/type to avoid duplicates
          await supabase.from(table)
            .delete()
            .eq('restaurant_name', sheet.restaurant)
            .eq('date', sheet.date)

          // Batch insert
          for (let b = 0; b < rowsWithUser.length; b += 500) {
            const { error } = await supabase.from(table).insert(rowsWithUser.slice(b, b + 500))
            if (error) throw new Error(error.message)
          }

          allSheets[i] = { ...sheet, status: 'done', rows: rows.length }
          setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'done', rows: rows.length } : r))
          done++
          totalRows += rows.length
        }
      } catch (e: any) {
        allSheets[i] = { ...sheet, status: 'error', error: e.message }
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'error', error: e.message } : r))
        errors++
      }

      setProgress(i + 1)
    }

    // Log to upload_log
    await supabase.from('upload_log').insert({
      file_name: file.name,
      report_type: 'bulk_import',
      restaurant_name: 'All Restaurants',
      date: `${year}-${String(month).padStart(2,'0')}-01`,
      rows_inserted: totalRows,
      uploaded_by: user?.id,
    })

    setSummary({ done, skipped, errors, rows: totalRows })
    setRunning(false)
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const statusIcon = (s: string) => ({
    pending:   <div className="w-3 h-3 rounded-full bg-gray-200"/>,
    uploading: <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>,
    done:      <div className="w-3 h-3 rounded-full bg-green-500"/>,
    error:     <div className="w-3 h-3 rounded-full bg-red-500"/>,
    skipped:   <div className="w-3 h-3 rounded-full bg-gray-300"/>,
  }[s] || null)

  const typeColor: Record<string,string> = {
    hourly_sales:   'bg-blue-100 text-blue-700',
    delivery_sales: 'bg-purple-100 text-purple-700',
    meal_count:     'bg-green-100 text-green-700',
    menu_mix:       'bg-amber-100 text-amber-700',
    inventory:      'bg-red-100 text-red-700',
  }

  const filtered = results.filter(r => filterType === 'all' || r.type === filterType)

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Bulk Import</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload a monthly tracking file with all daily sheets — all data parsed and stored automatically.</p>
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col gap-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Year</label>
            <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={year} onChange={e => setYear(parseInt(e.target.value))}>
              {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Month</label>
            <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={running}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><path d="M8 1v10M5 8l3-3 3 3M2 13h12"/></svg>
            {running ? 'Importing…' : 'Select Tracking File'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => e.target.files?.[0] && processFile(e.target.files[0])}/>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-500">
          <p className="font-medium text-gray-600 mb-1">Expected file format:</p>
          <p>Sheet names like <span className="font-mono bg-white border border-gray-200 px-1 rounded">1js</span>, <span className="font-mono bg-white border border-gray-200 px-1 rounded">15av</span>, <span className="font-mono bg-white border border-gray-200 px-1 rounded">31mk</span> — day + restaurant code (j/a/k) + report type (s/sd/ma/mj/mk/ap/jp/kp/av/jv/kv)</p>
        </div>
      </div>

      {/* Progress */}
      {(running || results.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">
              {running ? `Importing… ${progress} / ${total}` : `Complete — ${progress} sheets processed`}
            </p>
            <span className="text-xs text-gray-400">{Math.round((progress/Math.max(total,1))*100)}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="h-2 rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${(progress/Math.max(total,1))*100}%` }}/>
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Sheets Imported', value: summary.done, color: 'text-green-600' },
            { label: 'Total Rows',      value: summary.rows.toLocaleString(), color: 'text-blue-600' },
            { label: 'Skipped (empty)', value: summary.skipped, color: 'text-gray-400' },
            { label: 'Errors',          value: summary.errors, color: summary.errors > 0 ? 'text-red-600' : 'text-gray-400' },
          ].map((k,i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
              <p className={`text-xl font-semibold font-mono ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-semibold text-gray-700">Sheet Results</p>
            <div className="flex gap-2 items-center">
              <select className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
                value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="all">All Types</option>
                {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <span className="text-xs text-gray-400">{filtered.length} sheets</span>
            </div>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['','Day','Restaurant','Report Type','Date','Rows','Status'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} className={`border-b border-gray-50 ${i%2===0?'bg-white':'bg-gray-50/50'}`}>
                    <td className="px-3 py-2">{statusIcon(r.status)}</td>
                    <td className="px-3 py-2 font-mono text-gray-500">{r.day}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate">{r.restaurant.split(' - ')[2] || r.restaurant}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeColor[r.type]||'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABELS[r.type] || r.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-500">{r.date}</td>
                    <td className="px-3 py-2 font-mono text-gray-600">{r.rows || (r.status==='done'?r.rows:'—')}</td>
                    <td className="px-3 py-2">
                      {r.status === 'done'    && <span className="text-green-600 font-medium">✓ Done</span>}
                      {r.status === 'error'   && <span className="text-red-500 cursor-help" title={r.error}>✕ {r.error?.slice(0,40)||'Error'}</span>}
                      {r.status === 'skipped' && <span className="text-gray-400">— Empty</span>}
                      {r.status === 'uploading' && <span className="text-blue-500">Uploading…</span>}
                      {r.status === 'pending' && <span className="text-gray-300">Pending</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results.length === 0 && !running && (
        <div className="bg-white border border-gray-200 rounded-xl p-14 text-center shadow-sm">
          <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" viewBox="0 0 24 24">
              <path d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V7l-5-5H5a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
          </div>
          <p className="font-medium text-gray-700">Select your monthly tracking file</p>
          <p className="text-sm text-gray-400 mt-1">All 434 sheets will be parsed and uploaded automatically — no manual work needed</p>
        </div>
      )}
    </div>
  )
}
