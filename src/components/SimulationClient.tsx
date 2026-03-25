'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import * as XLSX from 'xlsx'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

interface MasterItem {
  item_code: string
  item_name: string
  correct_price: number
  unit: string
  category: string
  price_per_cs: number
  qty_per_cs: number
}

interface Recipe {
  recipe_code: string
  recipe_name: string
  selling_price: number
}

interface Ingredient {
  recipe_code: string
  ingredient_code: string
  ingredient_name: string
  ingredient_qty: number
  ingredient_unit: string
}

interface SimItem {
  item_code: string
  item_name: string
  unit: string
  old_price: number
  new_price: number | string
  old_price_cs: number
  new_price_cs: number | string
  qty_per_cs: number | string
  change_type: 'amount' | 'percent'
  change_value: string
}

export default function SimulationClient() {
  const supabase = createClient()
  const [masterItems, setMasterItems] = useState<MasterItem[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [sellingPrices, setSellingPrices] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const [simItems, setSimItems] = useState<SimItem[]>([])
  const [simSearch, setSimSearch] = useState('')
  const [simYear, setSimYear] = useState(new Date().getFullYear())
  const [simMonth, setSimMonth] = useState(new Date().getMonth() + 1)
  const [simMealCounts, setSimMealCounts] = useState<Record<string, number>>({})
  const [simMonthLoading, setSimMonthLoading] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [mi, r, ri] = await Promise.all([
      supabase.from('master_items').select('item_code, item_name, correct_price, unit, category, price_per_cs, qty_per_cs'),
      supabase.from('recipes').select('recipe_code, recipe_name, selling_price'),
      supabase.from('recipe_ingredients').select('*'),
    ])
    setMasterItems(mi.data ?? [])
    setRecipes(r.data ?? [])
    setIngredients(ri.data ?? [])
    const sp: Record<string, number> = {}
    r.data?.forEach((rec: any) => { sp[String(rec.recipe_code)] = rec.selling_price || 0 })
    setSellingPrices(sp)
    setLoading(false)
  }

  async function loadSimMealCounts() {
    setSimMonthLoading(true)
    const dateFrom = `${simYear}-${String(simMonth).padStart(2, '0')}-01`
    const lastDay = new Date(simYear, simMonth, 0).getDate()
    const dateTo = `${simYear}-${String(simMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const { data: mc } = await supabase.from('meal_count').select('item_code, meal_count').gte('date', dateFrom).lte('date', dateTo)
    const counts: Record<string, number> = {}
    mc?.forEach((r: any) => { const k = String(r.item_code); counts[k] = (counts[k] || 0) + (r.meal_count || 0) })
    setSimMealCounts(counts)
    setSimMonthLoading(false)
  }

  function addSimItem(master: MasterItem) {
    if (simItems.find(s => s.item_code === master.item_code)) return
    setSimItems(prev => [...prev, {
      item_code: master.item_code,
      item_name: master.item_name,
      unit: master.unit || '',
      old_price: master.correct_price || 0,
      new_price: master.correct_price || 0,
      old_price_cs: master.price_per_cs || 0,
      new_price_cs: master.price_per_cs || 0,
      qty_per_cs: master.qty_per_cs || 1,
      change_type: 'amount',
      change_value: String(master.correct_price || 0),
    }])
    setSimSearch('')
  }

  function updateSimItem(code: string, field: string, val: string) {
    setSimItems(prev => prev.map(s => {
      if (s.item_code !== code) return s
      const updated: any = { ...s }
      if (field === 'new_price_cs') {
        updated.new_price_cs = val === '' ? '' : parseFloat(val)
        const newCs = parseFloat(val)
        const qty = parseFloat(String(s.qty_per_cs)) || 1
        if (!isNaN(newCs) && qty > 0) { updated.new_price = newCs / qty; updated.change_value = String(updated.new_price) }
        updated.change_type = 'amount'
      } else if (field === 'qty_per_cs') {
        updated.qty_per_cs = val === '' ? '' : parseFloat(val)
        const qty = parseFloat(val) || 1
        const cs = parseFloat(String(s.new_price_cs)) || parseFloat(String(s.old_price_cs)) || 0
        if (qty > 0 && cs > 0) { updated.new_price = cs / qty; updated.change_value = String(updated.new_price) }
        updated.change_type = 'amount'
      } else if (field === 'new_price') {
        updated.new_price = val === '' ? '' : parseFloat(val)
        const newUnit = parseFloat(val)
        const qty = parseFloat(String(s.qty_per_cs)) || 1
        if (!isNaN(newUnit)) { updated.new_price_cs = newUnit * qty; updated.change_value = val }
        updated.change_type = 'amount'
      } else if (field === 'change_value' || field === 'change_type') {
        updated[field] = val
        const cv = parseFloat(field === 'change_value' ? val : s.change_value) || 0
        const ct = field === 'change_type' ? val : s.change_type
        const np = ct === 'percent' ? (s.old_price as number) * (1 + cv / 100) : cv
        if (!isNaN(np)) { updated.new_price = np; const qty = parseFloat(String(s.qty_per_cs)) || 1; updated.new_price_cs = np * qty }
      }
      return updated
    }))
  }

  const masterMap = Object.fromEntries(masterItems.map(m => [String(m.item_code), m]))

  // Calculate simulation results
  const simResults = recipes.map(recipe => {
    const ings = ingredients.filter(i => i.recipe_code === recipe.recipe_code)
    let oldCost = 0, newCost = 0
    ings.forEach(ing => {
      const master = masterMap[String(ing.ingredient_code)]
      const oldPrice = master?.correct_price || 0
      const simItem = simItems.find(s => s.item_code === String(ing.ingredient_code))
      const newPrice = simItem ? (parseFloat(String(simItem.new_price)) || 0) : oldPrice
      oldCost += ing.ingredient_qty * oldPrice
      newCost += ing.ingredient_qty * newPrice
    })
    const sp = sellingPrices[recipe.recipe_code] || 0
    const oldMargin = sp > 0 ? ((sp - oldCost) / sp * 100) : 0
    const newMargin = sp > 0 ? ((sp - newCost) / sp * 100) : 0
    const sold = simMealCounts[recipe.recipe_code] || 0
    const monthlyImpact = (newCost - oldCost) * sold
    const costIncrease = newCost - oldCost
    return { ...recipe, ings, oldCost, newCost, sp, oldMargin, newMargin, costIncrease, sold, monthlyImpact, affected: costIncrease !== 0 }
  }).filter(r => r.affected).sort((a, b) => Math.abs(b.monthlyImpact) - Math.abs(a.monthlyImpact))

  const totalMonthlyImpact = simResults.reduce((s, r) => s + r.monthlyImpact, 0)

  const marginColor = (pct: number) =>
    pct >= 60 ? 'text-green-600 bg-green-50' : pct >= 40 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'

  function exportSimulation() {
    const rows = simResults.map(r => ({
      'Recipe Code': r.recipe_code, 'Recipe Name': r.recipe_name,
      'Old Cost/Portion': parseFloat(r.oldCost.toFixed(5)),
      'New Cost/Portion': parseFloat(r.newCost.toFixed(5)),
      'Cost Increase': parseFloat(r.costIncrease.toFixed(5)),
      'Selling Price': r.sp,
      'Old Margin %': parseFloat(r.oldMargin.toFixed(2)),
      'New Margin %': parseFloat(r.newMargin.toFixed(2)),
      'Meals Sold': r.sold,
      'Monthly Impact (KWD)': parseFloat(r.monthlyImpact.toFixed(3)),
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{wch:12},{wch:40},{wch:16},{wch:16},{wch:14},{wch:14},{wch:14},{wch:14},{wch:12},{wch:20}]
    XLSX.utils.book_append_sheet(wb, ws, 'Simulation')
    const changes = simItems.map(s => ({
      'Item Code': s.item_code, 'Item Name': s.item_name, 'Unit': s.unit,
      'Old Unit Price (KWD)': parseFloat(Number(s.old_price).toFixed(5)),
      'New Unit Price (KWD)': parseFloat(Number(s.new_price).toFixed(5)),
      'Old CS Price (KWD)': parseFloat(Number(s.old_price_cs).toFixed(3)),
      'New CS Price (KWD)': parseFloat(Number(s.new_price_cs).toFixed(3)),
      'Qty per CS': s.qty_per_cs,
      '% Change': parseFloat(Number(s.old_price) > 0 ? ((Number(s.new_price) - Number(s.old_price)) / Number(s.old_price) * 100).toFixed(2) : '0'),
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(changes), 'Price Changes')
    XLSX.writeFile(wb, `Simulation_${MONTHS[simMonth - 1]}_${simYear}.xlsx`)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400 gap-2 text-sm">
      <div className="w-4 h-4 border-2 border-gray-200 border-t-purple-500 rounded-full animate-spin"/>
      Loading master items and recipes…
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">⚡ Price Simulation</h1>
        <p className="text-sm text-gray-500 mt-0.5">Simulate price changes for any raw material and instantly see the impact on all recipes and monthly cost.</p>
      </div>

      {/* Month selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Year</label>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={simYear} onChange={e => setSimYear(parseInt(e.target.value))}>
            {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Month (for monthly impact)</label>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={simMonth} onChange={e => setSimMonth(parseInt(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <button onClick={loadSimMealCounts} disabled={simMonthLoading}
          className="flex items-center gap-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          {simMonthLoading ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"/> : null}
          {simMonthLoading ? 'Loading…' : 'Load Meal Data'}
        </button>
        {Object.keys(simMealCounts).length > 0 && (
          <span className="text-xs text-green-600 font-medium">✓ {Object.keys(simMealCounts).length} items loaded for {MONTHS[simMonth - 1]} {simYear}</span>
        )}
      </div>

      {/* Search and add items */}
      <div className="bg-white border border-purple-200 rounded-xl p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-700 mb-3">Step 1 — Select items to simulate price change</p>
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/></svg>
            <input type="text" placeholder="Search raw material by name or code…" value={simSearch} onChange={e => setSimSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"/>
          </div>
          {simItems.length > 0 && (
            <button onClick={() => setSimItems([])} className="text-xs text-red-500 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">
              Clear All
            </button>
          )}
        </div>
        {simSearch.length > 1 && (
          <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
            {masterItems.filter(m =>
              m.item_name.toLowerCase().includes(simSearch.toLowerCase()) || String(m.item_code).includes(simSearch)
            ).slice(0, 10).map(m => (
              <div key={m.item_code} onClick={() => addSimItem(m)}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-purple-50 border-b border-gray-100 text-xs ${simItems.find(s => s.item_code === m.item_code) ? 'bg-purple-50 text-purple-700' : 'text-gray-700'}`}>
                <span><span className="font-mono text-gray-400 mr-2">{m.item_code}</span>{m.item_name}</span>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <span className="text-gray-400 font-mono">{Number(m.correct_price).toFixed(5)} KWD</span>
                  {simItems.find(s => s.item_code === m.item_code)
                    ? <span className="text-purple-600">✓ Added</span>
                    : <span className="text-blue-600">+ Add</span>}
                </div>
              </div>
            ))}
            {masterItems.filter(m => m.item_name.toLowerCase().includes(simSearch.toLowerCase()) || String(m.item_code).includes(simSearch)).length === 0 && (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">No items found</div>
            )}
          </div>
        )}
      </div>

      {/* Price change inputs table */}
      {simItems.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Step 2 — Set new prices</p>
            <p className="text-xs text-gray-400 mt-0.5">Edit Unit Price or CS Price — they auto-calculate each other based on Qty/CS</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{minWidth:900}}>
              <thead className="bg-gray-50">
                <tr>
                  {['Code','Item Name','Unit','Old Unit Price','New Unit Price','Old CS Price','New CS Price','Qty/CS','% Change','Remove'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {simItems.map((s, i) => (
                  <tr key={s.item_code} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="px-3 py-2 font-mono text-gray-400 text-xs">{s.item_code}</td>
                    <td className="px-3 py-2 font-medium text-gray-700 max-w-[180px] truncate">{s.item_name}</td>
                    <td className="px-3 py-2 text-gray-500">{s.unit}</td>
                    <td className="px-3 py-2 font-mono text-gray-400">{Number(s.old_price).toFixed(5)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs">KWD</span>
                        <input type="number" step="0.00001"
                          className={`w-24 text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500 ${Number(s.new_price) !== Number(s.old_price) ? 'border-purple-300 bg-purple-50 font-semibold' : 'border-gray-200'}`}
                          value={isNaN(Number(s.new_price)) ? '' : s.new_price}
                          onChange={e => updateSimItem(s.item_code, 'new_price', e.target.value)}/>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-400">{isNaN(Number(s.old_price_cs)) || !s.old_price_cs ? '—' : Number(s.old_price_cs).toFixed(3)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs">KWD</span>
                        <input type="number" step="0.001"
                          className={`w-24 text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500 ${Number(s.new_price_cs) !== Number(s.old_price_cs) ? 'border-purple-300 bg-purple-50 font-semibold' : 'border-gray-200'}`}
                          value={isNaN(Number(s.new_price_cs)) ? '' : s.new_price_cs}
                          onChange={e => updateSimItem(s.item_code, 'new_price_cs', e.target.value)}/>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" step="1" className="w-16 text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        value={isNaN(Number(s.qty_per_cs)) ? '' : s.qty_per_cs}
                        onChange={e => updateSimItem(s.item_code, 'qty_per_cs', e.target.value)}/>
                    </td>
                    <td className={`px-3 py-2 font-mono font-medium text-xs ${Number(s.new_price) > Number(s.old_price) ? 'text-red-500' : Number(s.new_price) < Number(s.old_price) ? 'text-green-600' : 'text-gray-400'}`}>
                      {Number(s.old_price) > 0 && !isNaN(Number(s.new_price))
                        ? (Number(s.new_price) > Number(s.old_price) ? '+' : '') + ((Number(s.new_price) - Number(s.old_price)) / Number(s.old_price) * 100).toFixed(2) + '%'
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => setSimItems(prev => prev.filter(x => x.item_code !== s.item_code))}
                        className="text-red-400 hover:text-red-600 text-xs border border-red-200 px-2 py-1 rounded transition-colors">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results */}
      {simItems.length > 0 && simResults.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Recipes Affected',     value: simResults.length, color: '' },
              { label: 'Avg Cost Increase',    value: 'KWD ' + (simResults.reduce((s, r) => s + r.costIncrease, 0) / Math.max(simResults.length, 1)).toFixed(5), color: 'text-red-500' },
              { label: 'Total Monthly Impact', value: 'KWD ' + (totalMonthlyImpact >= 0 ? '+' : '') + totalMonthlyImpact.toFixed(3), color: totalMonthlyImpact > 0 ? 'text-red-600' : 'text-green-600' },
              { label: 'Items Changed',        value: simItems.length, color: '' },
            ].map((k, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
                <p className={`text-lg font-semibold font-mono ${k.color || 'text-gray-900'}`}>{k.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">Impact on Recipes — {MONTHS[simMonth - 1]} {simYear}</p>
                <p className="text-xs text-gray-400 mt-0.5">Sorted by highest monthly impact</p>
              </div>
              <button onClick={exportSimulation}
                className="flex items-center gap-2 text-xs bg-green-700 hover:bg-green-800 text-white font-medium px-3.5 py-2 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><path d="M8 1v10M5 8l3 3 3-3M2 13h12"/></svg>
                Export Excel
              </button>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs border-collapse" style={{minWidth:900}}>
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {['Recipe','Meals Sold','Old Cost','New Cost','Cost +/-','Selling Price','Old Margin','New Margin','Monthly Impact'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simResults.map((r, i) => (
                    <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-3 py-2 font-medium text-gray-700 max-w-[200px] truncate">{r.recipe_name}</td>
                      <td className="px-3 py-2 font-mono text-gray-500">{r.sold > 0 ? r.sold.toFixed(0) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 font-mono text-gray-600">{r.oldCost.toFixed(4)}</td>
                      <td className="px-3 py-2 font-mono font-medium text-gray-800">{r.newCost.toFixed(4)}</td>
                      <td className={`px-3 py-2 font-mono font-medium ${r.costIncrease > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {r.costIncrease > 0 ? '+' : ''}{r.costIncrease.toFixed(5)}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-500">{r.sp > 0 ? r.sp.toFixed(4) : '—'}</td>
                      <td className="px-3 py-2">
                        {r.sp > 0 ? <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${marginColor(r.oldMargin)}`}>{r.oldMargin.toFixed(1)}%</span> : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {r.sp > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${marginColor(r.newMargin)}`}>{r.newMargin.toFixed(1)}%</span>
                            {r.newMargin !== r.oldMargin && (
                              <span className={`text-xs ${r.newMargin > r.oldMargin ? 'text-green-500' : 'text-red-500'}`}>
                                {r.newMargin > r.oldMargin ? '▲' : '▼'}{Math.abs(r.newMargin - r.oldMargin).toFixed(1)}pp
                              </span>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td className={`px-3 py-2 font-mono font-medium ${r.monthlyImpact > 0 ? 'text-red-500' : r.monthlyImpact < 0 ? 'text-green-600' : 'text-gray-300'}`}>
                        {r.sold > 0 ? (r.monthlyImpact > 0 ? '+' : '') + r.monthlyImpact.toFixed(3) : <span className="text-gray-300">No data</span>}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-800 text-white font-semibold">
                    <td className="px-3 py-2.5">TOTAL</td>
                    <td className="px-3 py-2.5 font-mono">{simResults.reduce((s, r) => s + r.sold, 0).toFixed(0)}</td>
                    <td colSpan={5} className="px-3 py-2.5"/>
                    <td colSpan={1} className="px-3 py-2.5"/>
                    <td className={`px-3 py-2.5 font-mono ${totalMonthlyImpact > 0 ? 'text-red-300' : 'text-green-300'}`}>
                      {totalMonthlyImpact > 0 ? '+' : ''}KWD {totalMonthlyImpact.toFixed(3)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {simItems.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-14 text-center shadow-sm">
          <div className="w-14 h-14 bg-purple-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-purple-500" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" viewBox="0 0 24 24">
              <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <p className="font-medium text-gray-700">No items selected yet</p>
          <p className="text-sm text-gray-400 mt-1">Search for a raw material above and add it to simulate its price impact</p>
        </div>
      )}

      {simItems.length > 0 && simResults.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm text-sm text-gray-400">
          The selected items are not used in any recipe — try different items
        </div>
      )}
    </div>
  )
}
