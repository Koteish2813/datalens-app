'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import * as XLSX from 'xlsx'

interface Recipe {
  recipe_code: string
  recipe_name: string
  recipe_qty: number
  recipe_unit: string
  file_price: number
  file_avg_price: number
  file_last_price: number
  selling_price: number
}

interface Ingredient {
  recipe_code: string
  ingredient_code: string
  ingredient_name: string
  ingredient_qty: number
  ingredient_unit: string
}

interface MasterItem {
  item_code: string
  item_name: string
  correct_price: number
  unit: string
  category: string
}

interface RecipeWithCost extends Recipe {
  ingredients: (Ingredient & { unit_price: number; line_cost: number })[]
  total_cost: number
  selling_price: number
  margin: number
  margin_pct: number
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function RecipesClient() {
  const supabase = createClient()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [masterItems, setMasterItems] = useState<MasterItem[]>([])
  const [sellingPrices, setSellingPrices] = useState<Record<string,number>>({})
  const [mealCounts, setMealCounts] = useState<Record<string,number>>({})
  const [actualConsumption, setActualConsumption] = useState<Record<string,number>>({})
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [search, setSearch] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null)
  const [tab, setTab] = useState<'list'|'detail'|'monthly'|'variance'>('list')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [monthLoading, setMonthLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [r, ri, mi] = await Promise.all([
      supabase.from('recipes').select('*').order('recipe_name'),
      supabase.from('recipe_ingredients').select('*'),
      supabase.from('master_items').select('item_code, item_name, correct_price, unit, category'),
    ])
    setRecipes(r.data ?? [])
    setIngredients(ri.data ?? [])
    setMasterItems(mi.data ?? [])
    // Load selling prices from recipes table
    const sp: Record<string,number> = {}
    r.data?.forEach((rec: any) => { if (rec.recipe_code) sp[String(rec.recipe_code)] = rec.selling_price || 0 })
    setSellingPrices(sp)
    setLoading(false)
  }

  async function loadMonthData() {
    setMonthLoading(true)
    const dateFrom = `${year}-${String(month).padStart(2,'0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const dateTo = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`

    // Selling prices from recipes table (imported from Menu_Item_Price.xlsx)
    const { data: recipeData } = await supabase.from('recipes').select('recipe_code, selling_price')
    const sp: Record<string,number> = {}
    recipeData?.forEach((r: any) => { if (r.recipe_code) sp[String(r.recipe_code)] = r.selling_price || 0 })
    setSellingPrices(sp)

    // Meal counts
    const { data: mc } = await supabase.from('meal_count')
      .select('item_code, meal_count')
      .gte('date', dateFrom).lte('date', dateTo)

    const counts: Record<string,number> = {}
    mc?.forEach((r: any) => {
      const k = String(r.item_code)
      counts[k] = (counts[k] || 0) + (r.meal_count || 0)
    })
    setMealCounts(counts)

    // Actual consumption from inventory
    const { data: inv } = await supabase.from('inventory')
      .select('item_code, actual_consumption')
      .gte('date', dateFrom).lte('date', dateTo)

    const ac: Record<string,number> = {}
    inv?.forEach((r: any) => {
      const k = String(r.item_code)
      ac[k] = (ac[k] || 0) + (r.actual_consumption || 0)
    })
    setActualConsumption(ac)
    setMonthLoading(false)
  }

  // Import recipes from Excel — handles both Recipe.xlsx and Menu_Item_Price.xlsx
  async function handleImport(file: File) {
    setImporting(true); setImportMsg('Reading file…')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })

    // Detect file type by first row columns
    const firstRow = rows[0] || {}
    const isSellingPriceFile = 'selling' in firstRow || 'code' in firstRow

    if (isSellingPriceFile) {
      // Handle Menu_Item_Price.xlsx — update selling prices only
      setImportMsg('Detected selling price file. Updating prices…')
      const updates = rows
        .filter(r => r['code'] && r['selling'])
        .map(r => ({ recipe_code: String(r['code']).trim(), selling_price: Number(r['selling']) || 0 }))

      let updated = 0
      for (const u of updates) {
        const { error } = await supabase.from('recipes')
          .update({ selling_price: u.selling_price })
          .eq('recipe_code', u.recipe_code)
        if (!error) updated++
      }
      setImportMsg(`✓ Updated selling prices for ${updated} recipes!`)
      setTimeout(() => setImportMsg(''), 4000)
      setImporting(false)
      loadAll()
      return
    }

    // Handle Recipe.xlsx — full recipe import
    const recipeMap: Record<string, { header: any; ingredients: any[] }> = {}
    rows.forEach(r => {
      const code = String(r['Recipe Item Code'] || '').trim()
      if (!code || code === 'date') return
      if (!recipeMap[code]) recipeMap[code] = { header: r, ingredients: [] }
      if (r['Ingredient Code'] && r['Ingredient Name']) {
        recipeMap[code].ingredients.push({
          recipe_code: code,
          ingredient_code: String(r['Ingredient Code']).trim(),
          ingredient_name: String(r['Ingredient Name']).trim(),
          ingredient_qty: Number(r['Ingredient Qty']) || 0,
          ingredient_unit: String(r['Ingredient Unit'] || '').trim(),
        })
      }
    })

    const recipeRows = Object.entries(recipeMap).map(([code, v]) => ({
      recipe_code: code,
      recipe_name: String(v.header['Recipe Name'] || '').trim(),
      recipe_qty: Number(v.header['Recipe Qty']) || 1,
      recipe_unit: String(v.header['Recipe Unit'] || 'PORTION').trim(),
      file_price: Number(v.header['Price']) || 0,
      file_avg_price: Number(v.header['Avg.Price']) || 0,
      file_last_price: Number(v.header['Last Price']) || 0,
      selling_price: 0,
    }))

    setImportMsg(`Found ${recipeRows.length} recipes. Importing…`)

    // Upsert recipes (preserve existing selling_price)
    const { error: re } = await supabase.from('recipes').upsert(recipeRows, { onConflict: 'recipe_code', ignoreDuplicates: false })
    if (re) { setImportMsg(`Error: ${re.message}`); setImporting(false); return }

    // Delete old ingredients and re-insert
    const codes = recipeRows.map(r => r.recipe_code)
    await supabase.from('recipe_ingredients').delete().in('recipe_code', codes)

    const allIngredients = Object.values(recipeMap).flatMap(v => v.ingredients)
    for (let i = 0; i < allIngredients.length; i += 500) {
      const { error: ie } = await supabase.from('recipe_ingredients').insert(allIngredients.slice(i, i+500))
      if (ie) { setImportMsg(`Error inserting ingredients: ${ie.message}`); setImporting(false); return }
    }

    setImportMsg(`✓ Imported ${recipeRows.length} recipes with ${allIngredients.length} ingredients!`)
    setTimeout(() => setImportMsg(''), 4000)
    setImporting(false)
    loadAll()
  }

  // Build master lookup
  const masterMap = Object.fromEntries(masterItems.map(m => [String(m.item_code), m]))

  // Calculate recipe cost
  function calcRecipe(recipe: Recipe): RecipeWithCost {
    const ings = ingredients.filter(i => i.recipe_code === recipe.recipe_code)
    const enriched = ings.map(ing => {
      const master = masterMap[String(ing.ingredient_code)]
      const unit_price = master?.correct_price || 0
      const line_cost = ing.ingredient_qty * unit_price
      return { ...ing, unit_price, line_cost }
    })
    const total_cost = enriched.reduce((s, i) => s + i.line_cost, 0)
    const selling_price = sellingPrices[recipe.recipe_code] || 0
    const margin = selling_price - total_cost
    const margin_pct = selling_price > 0 ? (margin / selling_price) * 100 : 0
    return { ...recipe, ingredients: enriched, total_cost, selling_price, margin, margin_pct }
  }

  const allCalc = recipes.map(calcRecipe)

  // Filter
  const filtered = allCalc.filter(r =>
    !search || r.recipe_name.toLowerCase().includes(search.toLowerCase()) || r.recipe_code.includes(search)
  )

  const selectedCalc = selectedRecipe ? allCalc.find(r => r.recipe_code === selectedRecipe) : null

  // Margin color
  const marginColor = (pct: number) =>
    pct >= 60 ? 'text-green-600 bg-green-50' :
    pct >= 40 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'
  const marginDot = (pct: number) =>
    pct >= 60 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-500'

  // Export recipes with costs
  function exportExcel() {
    const rows = allCalc.map(r => ({
      'Recipe Code': r.recipe_code,
      'Recipe Name': r.recipe_name,
      'Unit': r.recipe_unit,
      'Cost per Portion (KWD)': parseFloat(r.total_cost.toFixed(4)),
      'Selling Price (KWD)': parseFloat(r.selling_price.toFixed(4)),
      'Margin (KWD)': parseFloat(r.margin.toFixed(4)),
      'Margin %': parseFloat(r.margin_pct.toFixed(2)),
      'File Price': r.file_price,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Recipe Costs')
    XLSX.writeFile(wb, 'Recipe_Costs.xlsx')
  }

  // Monthly cost data
  const monthlyData = allCalc.map(r => {
    const sold = mealCounts[r.recipe_code] || 0
    const theoretical_cost = sold * r.total_cost
    const theoretical_revenue = sold * r.selling_price
    const food_cost_pct = theoretical_revenue > 0 ? (theoretical_cost / theoretical_revenue) * 100 : 0
    return { ...r, sold, theoretical_cost, theoretical_revenue, food_cost_pct }
  }).filter(r => r.sold > 0).sort((a,b) => b.theoretical_cost - a.theoretical_cost)

  const totalTheoreticalCost = monthlyData.reduce((s,r) => s + r.theoretical_cost, 0)
  const totalRevenue = monthlyData.reduce((s,r) => s + r.theoretical_revenue, 0)
  const overallFoodCostPct = totalRevenue > 0 ? (totalTheoreticalCost / totalRevenue) * 100 : 0

  // Variance data
  const varianceData = ingredients
    .filter(ing => ing.ingredient_code)
    .reduce((acc: any[], ing) => {
      const recipe = recipes.find(r => r.recipe_code === ing.recipe_code)
      if (!recipe) return acc
      const sold = mealCounts[recipe.recipe_code] || 0
      if (!sold) return acc
      const theoretical = ing.ingredient_qty * sold
      const actual = actualConsumption[ing.ingredient_code] || 0
      const existing = acc.find(a => a.ingredient_code === ing.ingredient_code)
      if (existing) {
        existing.theoretical += theoretical
      } else {
        acc.push({
          ingredient_code: ing.ingredient_code,
          ingredient_name: ing.ingredient_name,
          ingredient_unit: ing.ingredient_unit,
          theoretical,
          actual,
        })
      }
      return acc
    }, [])
    .map(v => {
      const master = masterMap[String(v.ingredient_code)]
      const unit_price = master?.correct_price || 0
      const variance_qty = v.actual - v.theoretical
      const variance_cost = variance_qty * unit_price
      return { ...v, unit_price, variance_qty, variance_cost }
    })
    .filter(v => v.theoretical > 0)
    .sort((a,b) => Math.abs(b.variance_cost) - Math.abs(a.variance_cost))

  const totalVarianceCost = varianceData.reduce((s,v) => s + v.variance_cost, 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Recipes & Food Cost</h1>
          <p className="text-sm text-gray-500 mt-0.5">Recipe costing based on Master Raw Items — margins, monthly cost and variance analysis.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="flex items-center gap-2 text-sm border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-3.5 py-2 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><path d="M8 1v10M5 8l3-3 3 3M2 13h12"/></svg>
            {importing ? 'Importing…' : 'Import Recipes'}
          </button>
          <button onClick={exportExcel} className="flex items-center gap-2 text-sm border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-3.5 py-2 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><path d="M8 1v10M5 8l3 3 3-3M2 13h12"/></svg>
            Export Costs
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>e.target.files?.[0]&&handleImport(e.target.files[0])}/>
        </div>
      </div>

      {importMsg && <div className={`border text-sm rounded-xl px-4 py-3 ${importMsg.startsWith('✓')?'bg-green-50 border-green-200 text-green-700':'bg-blue-50 border-blue-200 text-blue-700'}`}>{importMsg}</div>}

      {/* Summary KPIs */}
      {recipes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label:'Total Recipes',     value: recipes.length },
            { label:'Avg Cost/Portion',  value: 'KWD '+(allCalc.reduce((s,r)=>s+r.total_cost,0)/Math.max(allCalc.length,1)).toFixed(4) },
            { label:'Avg Margin',        value: (allCalc.filter(r=>r.selling_price>0).reduce((s,r)=>s+r.margin_pct,0)/Math.max(allCalc.filter(r=>r.selling_price>0).length,1)).toFixed(1)+'%' },
            { label:'Missing Prices',    value: allCalc.filter(r=>r.selling_price===0).length+' recipes' },
          ].map((k,i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
              <p className="text-lg font-semibold font-mono text-gray-900">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
        {(['list','detail','monthly','variance'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); if(t==='monthly'||t==='variance') loadMonthData() }}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${tab===t?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
            {t === 'list' ? 'Recipe List' : t === 'detail' ? 'Recipe Detail' : t === 'monthly' ? 'Monthly Cost' : 'Variance Analysis'}
          </button>
        ))}
      </div>

      {/* ── RECIPE LIST ── */}
      {tab === 'list' && (
        <div className="flex flex-col gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm flex gap-3 items-center">
            <div className="relative flex-1 max-w-xs">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/></svg>
              <input type="text" placeholder="Search recipes…" value={search} onChange={e=>setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <span className="text-xs text-gray-400">{filtered.length} recipes</span>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-xs border-collapse" style={{minWidth:800}}>
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    {['Code','Recipe Name','Ingredients','Cost/Portion','Selling Price','Margin (KWD)','Margin %','Action'].map(h=>(
                      <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      <div className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin"/>Loading…</div>
                    </td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                      {recipes.length === 0 ? 'No recipes yet. Click Import Recipes to upload your file.' : 'No recipes match your search.'}
                    </td></tr>
                  ) : filtered.map(r => (
                    <tr key={r.recipe_code} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedRecipe(r.recipe_code); setTab('detail') }}>
                      <td className="px-3 py-2 font-mono text-gray-500">{r.recipe_code}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 max-w-[220px] truncate">{r.recipe_name}</td>
                      <td className="px-3 py-2 text-gray-500">{r.ingredients.length}</td>
                      <td className="px-3 py-2 font-mono font-medium text-gray-800">{r.total_cost.toFixed(4)}</td>
                      <td className="px-3 py-2 font-mono text-gray-600">{r.selling_price > 0 ? r.selling_price.toFixed(4) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 font-mono">{r.selling_price > 0 ? <span className={r.margin >= 0 ? 'text-green-600' : 'text-red-500'}>{r.margin.toFixed(4)}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2">
                        {r.selling_price > 0 ? (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 w-fit ${marginColor(r.margin_pct)}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${marginDot(r.margin_pct)}`}/>
                            {r.margin_pct.toFixed(1)}%
                          </span>
                        ) : <span className="text-gray-300 text-xs">No price</span>}
                      </td>
                      <td className="px-3 py-2">
                        <button className="text-xs text-blue-600 hover:text-blue-800 font-medium">View →</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── RECIPE DETAIL ── */}
      {tab === 'detail' && (
        <div className="flex flex-col gap-4">
          {/* Recipe selector */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex gap-3 items-center flex-wrap">
            <label className="text-xs font-medium text-gray-500">Select Recipe:</label>
            <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white flex-1 max-w-md"
              value={selectedRecipe || ''} onChange={e => setSelectedRecipe(e.target.value)}>
              <option value="">Choose a recipe…</option>
              {recipes.map(r => <option key={r.recipe_code} value={r.recipe_code}>{r.recipe_name}</option>)}
            </select>
          </div>

          {selectedCalc && (
            <>
              {/* Cost summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label:'Cost per Portion', value:'KWD '+selectedCalc.total_cost.toFixed(4), sub:'from master items' },
                  { label:'Selling Price',     value: selectedCalc.selling_price > 0 ? 'KWD '+selectedCalc.selling_price.toFixed(4) : '—', sub:'from menu mix' },
                  { label:'Gross Margin',      value: selectedCalc.selling_price > 0 ? 'KWD '+selectedCalc.margin.toFixed(4) : '—', sub:'' },
                  { label:'Margin %',          value: selectedCalc.selling_price > 0 ? selectedCalc.margin_pct.toFixed(1)+'%' : '—',
                    color: selectedCalc.selling_price > 0 ? (selectedCalc.margin_pct >= 60 ? 'text-green-600' : selectedCalc.margin_pct >= 40 ? 'text-amber-600' : 'text-red-600') : '' },
                ].map((k,i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
                    <p className={`text-lg font-semibold font-mono ${k.color || 'text-gray-900'}`}>{k.value}</p>
                    {k.sub && <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>}
                  </div>
                ))}
              </div>

              {/* Ingredients table */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">{selectedCalc.recipe_name}</p>
                  <span className="text-xs text-gray-400">{selectedCalc.ingredients.length} ingredients · per {selectedCalc.recipe_qty} {selectedCalc.recipe_unit}</span>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Code','Ingredient Name','Qty','Unit','Unit Price (KWD)','Line Cost (KWD)','% of Total'].map(h=>(
                        <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCalc.ingredients.sort((a,b)=>b.line_cost-a.line_cost).map((ing,i) => (
                      <tr key={i} className={`border-b border-gray-50 ${i%2===0?'bg-white':'bg-gray-50/50'}`}>
                        <td className="px-3 py-2 font-mono text-gray-400">{ing.ingredient_code}</td>
                        <td className="px-3 py-2 font-medium text-gray-700">{ing.ingredient_name}</td>
                        <td className="px-3 py-2 font-mono">{ing.ingredient_qty}</td>
                        <td className="px-3 py-2 text-gray-500">{ing.ingredient_unit}</td>
                        <td className="px-3 py-2 font-mono">{ing.unit_price > 0 ? ing.unit_price.toFixed(5) : <span className="text-red-400">Not in master</span>}</td>
                        <td className="px-3 py-2 font-mono font-medium text-gray-800">{ing.line_cost.toFixed(5)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[80px]">
                              <div className="h-1.5 rounded-full bg-blue-500" style={{width:`${Math.min((ing.line_cost/selectedCalc.total_cost)*100,100).toFixed(1)}%`}}/>
                            </div>
                            <span className="text-gray-500">{selectedCalc.total_cost > 0 ? ((ing.line_cost/selectedCalc.total_cost)*100).toFixed(1)+'%' : '—'}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-800 text-white font-semibold">
                      <td colSpan={5} className="px-3 py-2.5">TOTAL COST PER PORTION</td>
                      <td className="px-3 py-2.5 font-mono">KWD {selectedCalc.total_cost.toFixed(4)}</td>
                      <td className="px-3 py-2.5">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!selectedCalc && (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm text-sm text-gray-400">
              Select a recipe above to see its full cost breakdown
            </div>
          )}
        </div>
      )}

      {/* ── MONTHLY COST ── */}
      {tab === 'monthly' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Year</label>
              <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={year} onChange={e=>setYear(parseInt(e.target.value))}>
                {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Month</label>
              <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={month} onChange={e=>setMonth(parseInt(e.target.value))}>
                {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
            <button onClick={loadMonthData} disabled={monthLoading}
              className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              {monthLoading ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"/> : null}
              {monthLoading ? 'Loading…' : 'Load Data'}
            </button>
          </div>

          {monthlyData.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label:'Recipes Sold',         value: monthlyData.length },
                  { label:'Total Theoretical Cost',value: 'KWD '+totalTheoreticalCost.toFixed(3) },
                  { label:'Total Revenue',         value: 'KWD '+totalRevenue.toFixed(3) },
                  { label:'Food Cost %',           value: overallFoodCostPct.toFixed(1)+'%',
                    color: overallFoodCostPct < 35 ? 'text-green-600' : overallFoodCostPct < 50 ? 'text-amber-600' : 'text-red-600' },
                ].map((k,i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
                    <p className={`text-lg font-semibold font-mono ${(k as any).color || 'text-gray-900'}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Monthly Cost by Recipe — {MONTHS[month-1]} {year}</p>
                </div>
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs border-collapse" style={{minWidth:700}}>
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {['Recipe','Meals Sold','Cost/Portion','Total Cost','Revenue','Margin','Food Cost %'].map(h=>(
                          <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map((r,i) => (
                        <tr key={i} className={`border-b border-gray-50 ${i%2===0?'bg-white':'bg-gray-50/50'}`}>
                          <td className="px-3 py-2 font-medium text-gray-700 max-w-[200px] truncate">{r.recipe_name}</td>
                          <td className="px-3 py-2 font-mono text-gray-600">{r.sold.toFixed(0)}</td>
                          <td className="px-3 py-2 font-mono text-gray-600">{r.total_cost.toFixed(4)}</td>
                          <td className="px-3 py-2 font-mono font-medium text-gray-800">{r.theoretical_cost.toFixed(3)}</td>
                          <td className="px-3 py-2 font-mono text-gray-600">{r.theoretical_revenue.toFixed(3)}</td>
                          <td className="px-3 py-2 font-mono">{(r.theoretical_revenue - r.theoretical_cost).toFixed(3)}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${marginColor(100-r.food_cost_pct)}`}>
                              {r.food_cost_pct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-800 text-white font-semibold">
                        <td className="px-3 py-2.5">TOTAL</td>
                        <td className="px-3 py-2.5 font-mono">{monthlyData.reduce((s,r)=>s+r.sold,0).toFixed(0)}</td>
                        <td className="px-3 py-2.5">—</td>
                        <td className="px-3 py-2.5 font-mono">KWD {totalTheoreticalCost.toFixed(3)}</td>
                        <td className="px-3 py-2.5 font-mono">KWD {totalRevenue.toFixed(3)}</td>
                        <td className="px-3 py-2.5 font-mono">KWD {(totalRevenue-totalTheoreticalCost).toFixed(3)}</td>
                        <td className="px-3 py-2.5">{overallFoodCostPct.toFixed(1)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          {monthlyData.length === 0 && !monthLoading && (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm text-sm text-gray-400">
              Select a month and click Load Data — make sure you have uploaded Meal Count data for that month
            </div>
          )}
        </div>
      )}

      {/* ── VARIANCE ANALYSIS ── */}
      {tab === 'variance' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Year</label>
              <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={year} onChange={e=>setYear(parseInt(e.target.value))}>
                {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Month</label>
              <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={month} onChange={e=>setMonth(parseInt(e.target.value))}>
                {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
            <button onClick={loadMonthData} disabled={monthLoading}
              className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              {monthLoading ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"/> : null}
              {monthLoading ? 'Loading…' : 'Load Data'}
            </button>
          </div>

          {varianceData.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label:'Ingredients Analyzed', value: varianceData.length },
                  { label:'Total Variance Cost',  value: 'KWD '+totalVarianceCost.toFixed(3),
                    color: totalVarianceCost > 0 ? 'text-red-600' : 'text-green-600' },
                  { label:'Over-consumed Items',  value: varianceData.filter(v=>v.variance_qty>0).length },
                ].map((k,i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
                    <p className={`text-lg font-semibold font-mono ${(k as any).color||'text-gray-900'}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Recipe vs Actual Consumption — {MONTHS[month-1]} {year}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Positive variance = over-consumed (waste/loss) · Negative = under-consumed (gain)</p>
                </div>
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs border-collapse" style={{minWidth:750}}>
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {['Code','Ingredient','Unit','Theoretical Qty','Actual Qty','Variance Qty','Unit Price','Variance Cost (KWD)'].map(h=>(
                          <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {varianceData.map((v,i) => (
                        <tr key={i} className={`border-b border-gray-50 ${i%2===0?'bg-white':'bg-gray-50/50'}`}>
                          <td className="px-3 py-2 font-mono text-gray-400">{v.ingredient_code}</td>
                          <td className="px-3 py-2 font-medium text-gray-700 max-w-[180px] truncate">{v.ingredient_name}</td>
                          <td className="px-3 py-2 text-gray-500">{v.ingredient_unit}</td>
                          <td className="px-3 py-2 font-mono text-gray-600">{v.theoretical.toFixed(2)}</td>
                          <td className="px-3 py-2 font-mono text-gray-600">{v.actual > 0 ? v.actual.toFixed(2) : <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 font-mono">
                            <span className={v.variance_qty > 0 ? 'text-red-500' : v.variance_qty < 0 ? 'text-green-600' : 'text-gray-400'}>
                              {v.variance_qty > 0 ? '+' : ''}{v.variance_qty.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-gray-600">{v.unit_price > 0 ? v.unit_price.toFixed(5) : '—'}</td>
                          <td className="px-3 py-2 font-mono font-medium">
                            <span className={v.variance_cost > 0 ? 'text-red-500' : v.variance_cost < 0 ? 'text-green-600' : 'text-gray-400'}>
                              {v.variance_cost > 0 ? '+' : ''}{v.variance_cost.toFixed(4)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-800 text-white font-semibold">
                        <td colSpan={7} className="px-3 py-2.5">TOTAL VARIANCE COST</td>
                        <td className={`px-3 py-2.5 font-mono ${totalVarianceCost > 0 ? 'text-red-300' : 'text-green-300'}`}>
                          KWD {totalVarianceCost > 0 ? '+' : ''}{totalVarianceCost.toFixed(3)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          {varianceData.length === 0 && !monthLoading && (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm text-sm text-gray-400">
              Select a month and click Load Data — requires Meal Count and Inventory data for that month
            </div>
          )}
        </div>
      )}
    </div>
  )
}
