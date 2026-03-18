import * as XLSX from 'xlsx'

export type ReportType = 'hourly_sales' | 'delivery_sales' | 'meal_count' | 'menu_mix' | 'inventory'

export interface ParseResult {
  reportType: ReportType
  restaurantName: string
  date: string
  rows: Record<string, any>[]
  error?: string
}

// Extract restaurant name from row 1
function extractRestaurant(ws: XLSX.WorkSheet): string {
  const cell = ws['A1']
  return cell?.v ? String(cell.v).trim() : 'Unknown Restaurant'
}

// Extract date from row 3 — pattern: Report(2026.03.01--2026.03.01)
function extractDate(ws: XLSX.WorkSheet): string {
  const cell = ws['A3']
  if (!cell?.v) return new Date().toISOString().split('T')[0]
  const match = String(cell.v).match(/(\d{4})\.(\d{2})\.(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  return new Date().toISOString().split('T')[0]
}

// Detect report type from row 3 content
function detectReportType(ws: XLSX.WorkSheet): ReportType {
  const cell = ws['A3']
  const val = cell?.v ? String(cell.v).toLowerCase() : ''
  if (val.includes('meal_count')) return 'meal_count'
  if (val.includes('menu_mix')) return 'menu_mix'
  if (val.includes('hourly_sales') || val.includes('hourly sales')) {
    // Check if it has delivery platform data (Tab column)
    const row10 = XLSX.utils.sheet_to_json(ws, { header: 1, range: 9, defval: '' })[0] as any[]
    if (row10 && row10.some((c: any) => String(c).toLowerCase().includes('tab'))) return 'delivery_sales'
    return 'hourly_sales'
  }
  // Check row 1/2 for inventory pattern (no date in row 3)
  const row2 = XLSX.utils.sheet_to_json(ws, { header: 1, range: 1, defval: '' })[0] as any[]
  if (row2 && row2[0] === 'Item Code') return 'inventory'
  const row1 = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: '' })[0] as any[]
  if (row1 && String(row1[0]).toUpperCase().includes('INNER TABLE')) return 'inventory'
  return 'hourly_sales'
}

// Parse hourly sales (data from row 12, date in row 11)
function parseHourlySales(ws: XLSX.WorkSheet, restaurant: string, date: string) {
  const rows: any[] = []
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
  // Find header row
  let headerRow = -1
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === 'Hour' || String(data[i][0]).includes('Hour')) { headerRow = i; break }
  }
  if (headerRow === -1) return rows
  for (let i = headerRow + 2; i < data.length; i++) {
    const r = data[i]
    const hour = String(r[0] || '')
    if (!hour || hour.includes('Total') || hour.includes('Grand') || !hour.includes(':')) continue
    rows.push({
      restaurant_name: restaurant,
      date,
      hour,
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
  return rows
}

// Parse delivery sales (has Tab/platform column)
function parseDeliverySales(ws: XLSX.WorkSheet, restaurant: string, date: string) {
  const rows: any[] = []
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
  let headerRow = -1
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).includes('Date') || String(data[i][1]).includes('Hour')) { headerRow = i; break }
  }
  if (headerRow === -1) return rows
  for (let i = headerRow + 1; i < data.length; i++) {
    const r = data[i]
    if (!r[0] || String(r[0]).includes('Total')) continue
    rows.push({
      restaurant_name: restaurant,
      date: String(r[0]).includes('-') ? r[0] : date,
      hour: String(r[1] || ''),
      platform: String(r[2] || ''),
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
  return rows
}

// Parse meal count
function parseMealCount(ws: XLSX.WorkSheet, restaurant: string, date: string) {
  const rows: any[] = []
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
  let headerRow = -1
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).includes('Super Category') || String(data[i][0]) === 'Super Category Name') { headerRow = i; break }
  }
  if (headerRow === -1) return rows
  for (let i = headerRow + 1; i < data.length; i++) {
    const r = data[i]
    if (!r[3] || String(r[0]).toLowerCase().includes('total')) continue
    rows.push({
      restaurant_name: restaurant,
      date,
      super_category: String(r[0] || ''),
      category: String(r[1] || ''),
      item_code: String(r[2] || ''),
      item_name: String(r[3] || ''),
      item_rate: Number(r[4]) || 0,
      item_quantity: Number(r[5]) || 0,
      combo_constituent_qty: Number(r[6]) || 0,
      total_quantity: Number(r[7]) || 0,
      portion_value: Number(r[8]) || 0,
      meal_count: Number(r[9]) || 0,
      total_price: Number(r[10]) || 0,
    })
  }
  return rows
}

// Parse menu mix
function parseMenuMix(ws: XLSX.WorkSheet, restaurant: string, date: string) {
  const rows: any[] = []
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
  let headerRow = -1, currentCategory = ''
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === 'SCategory') { headerRow = i; break }
  }
  if (headerRow === -1) return rows
  for (let i = headerRow + 1; i < data.length; i++) {
    const r = data[i]
    // Category header row
    if (r[0] && !r[1] && String(r[0]).trim() !== '') {
      if (!String(r[0]).includes('Total') && !String(r[0]).includes('Grand')) {
        currentCategory = String(r[0])
      }
      continue
    }
    if (String(r[0]).includes('Total') || String(r[0]).includes('Grand')) continue
    if (!r[1]) continue
    rows.push({
      restaurant_name: restaurant,
      date,
      scategory: currentCategory,
      item_number: String(r[1] || ''),
      item_name: String(r[2] || ''),
      comp_qty: Number(r[3]) || 0,
      non_comp_qty: Number(r[4]) || 0,
      number_sold: Number(r[5]) || 0,
      price_sold: Number(r[6]) || 0,
      amount: Number(r[7]) || 0,
      comp_amount: Number(r[8]) || 0,
      discount_amount: Number(r[9]) || 0,
      total_discount: Number(r[10]) || 0,
      net_sales: Number(r[11]) || 0,
      pct_of_sales: Number(r[12]) || 0,
      pct_of_scategory: Number(r[13]) || 0,
    })
  }
  return rows
}

// Parse inventory
function parseInventory(ws: XLSX.WorkSheet, restaurant: string) {
  const rows: any[] = []
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
  let headerRow = -1
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === 'Item Code') { headerRow = i; break }
  }
  if (headerRow === -1) return rows
  for (let i = headerRow + 1; i < data.length; i++) {
    const r = data[i]
    if (!r[0] || !r[1]) continue
    // Latest physical date from col 23 — some rows have '-' or 'NA' meaning no physical count
    let latestPhysical: string | null = null
    if (r[23] && r[23] instanceof Date) {
      latestPhysical = r[23].toISOString().split('T')[0]
    } else if (r[23]) {
      const val = String(r[23]).trim()
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
        latestPhysical = val.split('T')[0]
      }
      // '-', 'NA', or anything else = null (no physical count done)
    }
    const date = latestPhysical || new Date().toISOString().split('T')[0]
    rows.push({
      restaurant_name: restaurant,
      date,
      item_code: String(r[0] || ''),
      item_name: String(r[1] || ''),
      unit: String(r[2] || ''),
      category: String(r[3] || ''),
      average_price: Number(r[4]) || 0,
      opening: Number(r[5]) || 0,
      purchase: Number(r[7]) || 0,
      consumption: Number(r[11]) || 0,
      wastage: Number(r[15]) || 0,
      closing: Number(r[21]) || 0,
      latest_physical: latestPhysical,
      physical_qty: r[24] === 'NA' ? null : (Number(r[24]) || 0),
      variance: r[26] === 'NA' ? null : (Number(r[26]) || 0),
      variance_pct: r[28] === 'NA' ? null : (Number(r[28]) || 0),
      actual_consumption: Number(r[31]) || 0,
    })
  }
  return rows
}

// MAIN PARSE FUNCTION
export function parseExcelFile(buffer: ArrayBuffer, fileName: string): ParseResult {
  try {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const restaurant = extractRestaurant(ws)
    const reportType = detectReportType(ws)
    const date = reportType === 'inventory' ? new Date().toISOString().split('T')[0] : extractDate(ws)
    let rows: any[] = []

    switch (reportType) {
      case 'hourly_sales':   rows = parseHourlySales(ws, restaurant, date); break
      case 'delivery_sales': rows = parseDeliverySales(ws, restaurant, date); break
      case 'meal_count':     rows = parseMealCount(ws, restaurant, date); break
      case 'menu_mix':       rows = parseMenuMix(ws, restaurant, date); break
      case 'inventory':      rows = parseInventory(ws, restaurant); break
    }

    return { reportType, restaurantName: restaurant, date, rows }
  } catch (e: any) {
    return { reportType: 'hourly_sales', restaurantName: '', date: '', rows: [], error: e.message }
  }
}

export const REPORT_LABELS: Record<ReportType, string> = {
  hourly_sales:   'Hourly Sales',
  delivery_sales: 'Delivery Sales',
  meal_count:     'Meal Count',
  menu_mix:       'Menu Mix',
  inventory:      'Inventory & Wastage',
}

export const REPORT_TABLES: Record<ReportType, string> = {
  hourly_sales:   'hourly_sales',
  delivery_sales: 'delivery_sales',
  meal_count:     'meal_count',
  menu_mix:       'menu_mix',
  inventory:      'inventory',
}
