'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import * as XLSX from 'xlsx'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

interface MasterItem { item_code:string; item_name:string; correct_price:number; unit:string; category:string; price_per_cs:number; qty_per_cs:number }
interface Recipe { recipe_code:string; recipe_name:string; selling_price:number }
interface Ingredient { recipe_code:string; ingredient_code:string; ingredient_name:string; ingredient_qty:number; ingredient_unit:string }
interface SimItem { item_code:string; item_name:string; unit:string; old_price:number; new_price:number|string; old_price_cs:number; new_price_cs:number|string; qty_per_cs:number|string }

type SimMode = 'consumption'|'recipe'

export default function SimulationClient() {
  const supabase = createClient()
  const [masterItems, setMasterItems] = useState<MasterItem[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [sellingPrices, setSellingPrices] = useState<Record<string,number>>({})
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<SimMode>('consumption')
  const [simItems, setSimItems] = useState<SimItem[]>([])
  const [simSearch, setSimSearch] = useState('')
  const [simYear, setSimYear] = useState(new Date().getFullYear())
  const [simMonth, setSimMonth] = useState(new Date().getMonth()+1)
  const [simMealCounts, setSimMealCounts] = useState<Record<string,number>>({})
  const [consumptionData, setConsumptionData] = useState<Record<string,{qty:number;item_name:string;unit:string}>>({})
  const [dataLoading, setDataLoading] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [mi, r, ri] = await Promise.all([
      supabase.from('master_items').select('item_code,item_name,correct_price,unit,category,price_per_cs,qty_per_cs'),
      supabase.from('recipes').select('recipe_code,recipe_name,selling_price'),
      supabase.from('recipe_ingredients').select('*'),
    ])
    setMasterItems(mi.data??[]); setRecipes(r.data??[]); setIngredients(ri.data??[])
    const sp:Record<string,number>={}
    r.data?.forEach((rec:any)=>{sp[String(rec.recipe_code)]=rec.selling_price||0})
    setSellingPrices(sp); setLoading(false)
  }

  async function loadMonthData() {
    setDataLoading(true); setDataLoaded(false)
    const dateFrom=`${simYear}-${String(simMonth).padStart(2,'0')}-01`
    const lastDay=new Date(simYear,simMonth,0).getDate()
    const dateTo=`${simYear}-${String(simMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    const {data:mc}=await supabase.from('meal_count').select('item_code,meal_count').gte('date',dateFrom).lte('date',dateTo)
    const counts:Record<string,number>={}
    mc?.forEach((r:any)=>{const k=String(r.item_code);counts[k]=(counts[k]||0)+(r.meal_count||0)})
    setSimMealCounts(counts)
    const {data:inv}=await supabase.from('inventory').select('item_code,item_name,unit,consumption').gte('date',dateFrom).lte('date',dateTo)
    const cons:Record<string,{qty:number;item_name:string;unit:string}>={}
    inv?.forEach((r:any)=>{
      const k=String(r.item_code)
      if(!cons[k]) cons[k]={qty:0,item_name:r.item_name||'',unit:r.unit||''}
      cons[k].qty+=(r.consumption||0)
    })
    setConsumptionData(cons); setDataLoading(false); setDataLoaded(true)
  }

  function addSimItem(m:MasterItem) {
    if(simItems.find(s=>s.item_code===m.item_code)) return
    setSimItems(prev=>[...prev,{item_code:m.item_code,item_name:m.item_name,unit:m.unit||'',old_price:m.correct_price||0,new_price:m.correct_price||0,old_price_cs:m.price_per_cs||0,new_price_cs:m.price_per_cs||0,qty_per_cs:m.qty_per_cs||1}])
    setSimSearch('')
  }

  function updateSimItem(code:string,field:string,val:string) {
    setSimItems(prev=>prev.map(s=>{
      if(s.item_code!==code) return s
      const u:any={...s}
      if(field==='new_price_cs'){u.new_price_cs=val===''?'':parseFloat(val);const cs=parseFloat(val);const q=parseFloat(String(s.qty_per_cs))||1;if(!isNaN(cs)&&q>0) u.new_price=cs/q}
      else if(field==='qty_per_cs'){u.qty_per_cs=val===''?'':parseFloat(val);const q=parseFloat(val)||1;const cs=parseFloat(String(s.new_price_cs))||parseFloat(String(s.old_price_cs))||0;if(q>0&&cs>0) u.new_price=cs/q}
      else if(field==='new_price'){u.new_price=val===''?'':parseFloat(val);const np=parseFloat(val);const q=parseFloat(String(s.qty_per_cs))||1;if(!isNaN(np)) u.new_price_cs=np*q}
      return u
    }))
  }

  const masterMap=Object.fromEntries(masterItems.map(m=>[String(m.item_code),m]))

  // Mode 1: Consumption
  const consResults=simItems.map(s=>{
    const c=consumptionData[s.item_code]
    const qty=c?.qty||0
    const oldP=s.old_price, newP=parseFloat(String(s.new_price))||0
    const oldCost=qty*oldP, newCost=qty*newP
    return {item_code:s.item_code,item_name:c?.item_name||s.item_name,unit:c?.unit||s.unit,qty,oldP,newP,oldCost,newCost,impact:newCost-oldCost,pct:oldP>0?((newP-oldP)/oldP*100):0}
  })
  const totOld=consResults.reduce((s,r)=>s+r.oldCost,0)
  const totNew=consResults.reduce((s,r)=>s+r.newCost,0)
  const totImpact=totNew-totOld

  // Mode 2: Recipe
  const recResults=recipes.map(recipe=>{
    const ings=ingredients.filter(i=>i.recipe_code===recipe.recipe_code)
    let oldCost=0,newCost=0
    ings.forEach(ing=>{
      const m=masterMap[String(ing.ingredient_code)]
      const oldP=m?.correct_price||0
      const sim=simItems.find(s=>s.item_code===String(ing.ingredient_code))
      const newP=sim?(parseFloat(String(sim.new_price))||0):oldP
      oldCost+=ing.ingredient_qty*oldP; newCost+=ing.ingredient_qty*newP
    })
    const sp=sellingPrices[recipe.recipe_code]||0
    const oldM=sp>0?((sp-oldCost)/sp*100):0
    const newM=sp>0?((sp-newCost)/sp*100):0
    const sold=simMealCounts[recipe.recipe_code]||0
    const impact=(newCost-oldCost)*sold
    return {...recipe,ings,oldCost,newCost,sp,oldM,newM,costInc:newCost-oldCost,sold,impact,affected:newCost!==oldCost}
  }).filter(r=>r.affected).sort((a,b)=>Math.abs(b.impact)-Math.abs(a.impact))
  const totMonthly=recResults.reduce((s,r)=>s+r.impact,0)

  const mc=(p:number)=>p>=60?'text-green-600 bg-green-50':p>=40?'text-amber-600 bg-amber-50':'text-red-600 bg-red-50'

  function expCons() {
    const rows=consResults.map(r=>({'Item Code':r.item_code,'Item Name':r.item_name,'Unit':r.unit,'Consumption Qty':r.qty,'Old Price':+r.oldP.toFixed(5),'New Price':+r.newP.toFixed(5),'Before Cost (KWD)':+r.oldCost.toFixed(3),'After Cost (KWD)':+r.newCost.toFixed(3),'Impact (KWD)':+r.impact.toFixed(3),'% Price Change':+r.pct.toFixed(2)}))
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Consumption Sim')
    XLSX.writeFile(wb,`Sim_Consumption_${MONTHS[simMonth-1]}_${simYear}.xlsx`)
  }

  function expRec() {
    const rows=recResults.map(r=>({'Recipe Code':r.recipe_code,'Recipe Name':r.recipe_name,'Before Cost':+r.oldCost.toFixed(5),'After Cost':+r.newCost.toFixed(5),'Cost Change':+r.costInc.toFixed(5),'Selling Price':r.sp,'Before Margin %':+r.oldM.toFixed(2),'After Margin %':+r.newM.toFixed(2),'Meals Sold':r.sold,'Monthly Impact':+r.impact.toFixed(3)}))
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Recipe Sim')
    XLSX.writeFile(wb,`Sim_Recipe_${MONTHS[simMonth-1]}_${simYear}.xlsx`)
  }

  if(loading) return <div className="flex items-center justify-center py-20 text-gray-400 gap-2 text-sm"><div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin"/>Loading…</div>

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">⚡ Price Simulation</h1>
        <p className="text-sm text-gray-500 mt-0.5">Simulate raw material price changes — two calculation modes.</p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={()=>setMode('consumption')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${mode==='consumption'?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
          Mode 1 — Consumption Based
        </button>
        <button onClick={()=>setMode('recipe')} className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${mode==='recipe'?'bg-white text-gray-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
          Mode 2 — Recipe Based
        </button>
      </div>

      {/* Mode description */}
      <div className={`border rounded-xl px-4 py-3 text-sm ${mode==='consumption'?'bg-blue-50 border-blue-200 text-blue-800':'bg-purple-50 border-purple-200 text-purple-800'}`}>
        {mode==='consumption'
          ? '📦 Uses consumption quantity from inventory × new price → shows before/after real cost impact based on what was actually consumed.'
          : '🍽️ Uses recipe ingredients × meals sold × new price → shows before/after impact on portion cost, margin % and monthly food cost.'}
      </div>

      {/* Month loader */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-end">
        <div><label className="block text-xs font-medium text-gray-500 mb-1.5">Year</label>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={simYear} onChange={e=>{setSimYear(parseInt(e.target.value));setDataLoaded(false)}}>
            {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
          </select></div>
        <div><label className="block text-xs font-medium text-gray-500 mb-1.5">Month</label>
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white" value={simMonth} onChange={e=>{setSimMonth(parseInt(e.target.value));setDataLoaded(false)}}>
            {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </select></div>
        <button onClick={loadMonthData} disabled={dataLoading} className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          {dataLoading?<div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"/>:null}
          {dataLoading?'Loading…':'Load Data'}
        </button>
        {dataLoaded&&<div className="flex gap-3 text-xs">
          <span className="text-green-600 font-medium">✓ {Object.keys(consumptionData).length} inventory items</span>
          <span className="text-green-600 font-medium">✓ {Object.keys(simMealCounts).length} meal items</span>
        </div>}
      </div>

      {/* Search */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-700 mb-3">Select raw materials to simulate</p>
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/></svg>
            <input type="text" placeholder="Search by name or code…" value={simSearch} onChange={e=>setSimSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
          </div>
          {simItems.length>0&&<button onClick={()=>setSimItems([])} className="text-xs text-red-500 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg">Clear All</button>}
        </div>
        {simSearch.length>1&&(
          <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
            {masterItems.filter(m=>m.item_name.toLowerCase().includes(simSearch.toLowerCase())||String(m.item_code).includes(simSearch)).slice(0,10).map(m=>(
              <div key={m.item_code} onClick={()=>addSimItem(m)} className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-blue-50 border-b border-gray-100 text-xs ${simItems.find(s=>s.item_code===m.item_code)?'bg-blue-50 text-blue-700':'text-gray-700'}`}>
                <span><span className="font-mono text-gray-400 mr-2">{m.item_code}</span>{m.item_name}</span>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <span className="text-gray-400 font-mono">{Number(m.correct_price).toFixed(5)} KWD</span>
                  {simItems.find(s=>s.item_code===m.item_code)?<span className="text-blue-600 font-medium">✓</span>:<span className="text-blue-600">+ Add</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Price input table */}
      {simItems.length>0&&(
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Set New Prices</p>
            <p className="text-xs text-gray-400 mt-0.5">Edit Unit Price or CS Price — they auto-calculate each other based on Qty/CS</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{minWidth:860}}>
              <thead className="bg-gray-50">
                <tr>{['Code','Item Name','Unit','Current Unit Price','New Unit Price','Current CS Price','New CS Price','Qty/CS','% Change',''].map(h=>(
                  <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {simItems.map((s,i)=>{
                  const pct=Number(s.old_price)>0&&!isNaN(Number(s.new_price))?((Number(s.new_price)-Number(s.old_price))/Number(s.old_price)*100):0
                  return(
                    <tr key={s.item_code} className={`border-b border-gray-50 ${i%2===0?'bg-white':'bg-gray-50/50'}`}>
                      <td className="px-3 py-2 font-mono text-gray-400">{s.item_code}</td>
                      <td className="px-3 py-2 font-medium text-gray-700 max-w-[160px] truncate">{s.item_name}</td>
                      <td className="px-3 py-2 text-gray-500">{s.unit}</td>
                      <td className="px-3 py-2 font-mono text-gray-400">{Number(s.old_price).toFixed(5)}</td>
                      <td className="px-3 py-2"><div className="flex items-center gap-1"><span className="text-gray-400 text-xs">KWD</span>
                        <input type="number" step="0.00001" className={`w-24 text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 ${Number(s.new_price)!==Number(s.old_price)?'border-blue-400 bg-blue-50 font-semibold':'border-gray-200'}`}
                          value={isNaN(Number(s.new_price))?'':s.new_price} onChange={e=>updateSimItem(s.item_code,'new_price',e.target.value)}/></div>
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-400">{!s.old_price_cs?'—':Number(s.old_price_cs).toFixed(3)}</td>
                      <td className="px-3 py-2"><div className="flex items-center gap-1"><span className="text-gray-400 text-xs">KWD</span>
                        <input type="number" step="0.001" className={`w-24 text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 ${Number(s.new_price_cs)!==Number(s.old_price_cs)?'border-blue-400 bg-blue-50 font-semibold':'border-gray-200'}`}
                          value={isNaN(Number(s.new_price_cs))?'':s.new_price_cs} onChange={e=>updateSimItem(s.item_code,'new_price_cs',e.target.value)}/></div>
                      </td>
                      <td className="px-3 py-2"><input type="number" step="1" className="w-16 text-xs border border-gray-200 rounded px-1.5 py-1"
                        value={isNaN(Number(s.qty_per_cs))?'':s.qty_per_cs} onChange={e=>updateSimItem(s.item_code,'qty_per_cs',e.target.value)}/></td>
                      <td className={`px-3 py-2 font-mono font-medium ${pct>0?'text-red-500':pct<0?'text-green-600':'text-gray-400'}`}>
                        {pct!==0?(pct>0?'+':'')+pct.toFixed(2)+'%':'—'}
                      </td>
                      <td className="px-3 py-2"><button onClick={()=>setSimItems(prev=>prev.filter(x=>x.item_code!==s.item_code))} className="text-red-400 hover:text-red-600 text-xs border border-red-200 px-2 py-1 rounded">✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODE 1 RESULTS ── */}
      {mode==='consumption'&&simItems.length>0&&(
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {label:'Before — Total Cost',value:`KWD ${totOld.toFixed(3)}`,color:'text-gray-900'},
              {label:'After — Total Cost',value:`KWD ${totNew.toFixed(3)}`,color:'text-gray-900'},
              {label:'Total Impact',value:(totImpact>=0?'+':'')+`KWD ${totImpact.toFixed(3)}`,color:totImpact>0?'text-red-600':totImpact<0?'text-green-600':'text-gray-400'},
              {label:'Items with Consumption',value:consResults.filter(r=>r.qty>0).length.toString(),color:'text-gray-900'},
            ].map((k,i)=>(
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
                <p className={`text-base font-semibold font-mono ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">Before vs After — {MONTHS[simMonth-1]} {simYear} Consumption</p>
                <p className="text-xs text-gray-400 mt-0.5">Based on consumption quantity from inventory report (not actual consumption)</p>
              </div>
              <button onClick={expCons} className="flex items-center gap-2 text-xs bg-green-700 hover:bg-green-800 text-white font-medium px-3.5 py-2 rounded-lg">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><path d="M8 1v10M5 8l3 3 3-3M2 13h12"/></svg>Export Excel
              </button>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs border-collapse" style={{minWidth:850}}>
                <thead className="bg-gray-50 sticky top-0">
                  <tr>{['Code','Item Name','Unit','Consumption Qty','Old Price','New Price','Before Cost (KWD)','After Cost (KWD)','Impact (KWD)','% Price Change'].map(h=>(
                    <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {consResults.map((r,i)=>(
                    <tr key={i} className={`border-b border-gray-50 ${i%2===0?'bg-white':'bg-gray-50/50'}`}>
                      <td className="px-3 py-2 font-mono text-gray-400">{r.item_code}</td>
                      <td className="px-3 py-2 font-medium text-gray-700 max-w-[200px] truncate">{r.item_name}</td>
                      <td className="px-3 py-2 text-gray-500">{r.unit}</td>
                      <td className="px-3 py-2 font-mono text-gray-600">{r.qty>0?r.qty.toFixed(2):<span className="text-gray-300">No data</span>}</td>
                      <td className="px-3 py-2 font-mono text-gray-600">{r.oldP.toFixed(5)}</td>
                      <td className={`px-3 py-2 font-mono font-medium ${r.newP>r.oldP?'text-red-500':r.newP<r.oldP?'text-green-600':'text-gray-600'}`}>{r.newP.toFixed(5)}</td>
                      <td className="px-3 py-2 font-mono text-gray-700">{r.qty>0?r.oldCost.toFixed(3):'—'}</td>
                      <td className="px-3 py-2 font-mono font-medium text-gray-900">{r.qty>0?r.newCost.toFixed(3):'—'}</td>
                      <td className={`px-3 py-2 font-mono font-medium ${r.impact>0?'text-red-500':r.impact<0?'text-green-600':'text-gray-400'}`}>
                        {r.qty>0?(r.impact>0?'+':'')+r.impact.toFixed(3):'—'}
                      </td>
                      <td className={`px-3 py-2 font-mono ${r.pct>0?'text-red-500':r.pct<0?'text-green-600':'text-gray-400'}`}>
                        {r.pct!==0?(r.pct>0?'+':'')+r.pct.toFixed(2)+'%':'—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-800 text-white font-semibold sticky bottom-0">
                    <td colSpan={6} className="px-3 py-2.5">TOTAL</td>
                    <td className="px-3 py-2.5 font-mono">KWD {totOld.toFixed(3)}</td>
                    <td className="px-3 py-2.5 font-mono">KWD {totNew.toFixed(3)}</td>
                    <td className={`px-3 py-2.5 font-mono ${totImpact>0?'text-red-300':'text-green-300'}`}>{totImpact>0?'+':''}KWD {totImpact.toFixed(3)}</td>
                    <td className="px-3 py-2.5"/>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODE 2 RESULTS ── */}
      {mode==='recipe'&&simItems.length>0&&(
        <div className="flex flex-col gap-4">
          {recResults.length>0?(
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {label:'Recipes Affected',value:recResults.length.toString(),color:'text-gray-900'},
                  {label:'Avg Cost Change',value:'KWD '+(recResults.reduce((s,r)=>s+r.costInc,0)/Math.max(recResults.length,1)).toFixed(5),color:'text-red-500'},
                  {label:'Total Monthly Impact',value:(totMonthly>=0?'+':'')+`KWD ${totMonthly.toFixed(3)}`,color:totMonthly>0?'text-red-600':'text-green-600'},
                  {label:'Items Changed',value:simItems.length.toString(),color:'text-gray-900'},
                ].map((k,i)=>(
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
                    <p className={`text-base font-semibold font-mono ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Recipe Impact — {MONTHS[simMonth-1]} {simYear}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Before vs after portion cost · margin change · monthly impact</p>
                  </div>
                  <button onClick={expRec} className="flex items-center gap-2 text-xs bg-green-700 hover:bg-green-800 text-white font-medium px-3.5 py-2 rounded-lg">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><path d="M8 1v10M5 8l3 3 3-3M2 13h12"/></svg>Export Excel
                  </button>
                </div>
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-xs border-collapse" style={{minWidth:900}}>
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>{['Recipe','Meals Sold','Before Cost','After Cost','Cost +/-','Selling Price','Before Margin','After Margin','Monthly Impact'].map(h=>(
                        <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {recResults.map((r,i)=>(
                        <tr key={i} className={`border-b border-gray-50 ${i%2===0?'bg-white':'bg-gray-50/50'}`}>
                          <td className="px-3 py-2 font-medium text-gray-700 max-w-[200px] truncate">{r.recipe_name}</td>
                          <td className="px-3 py-2 font-mono text-gray-500">{r.sold>0?r.sold.toFixed(0):<span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 font-mono text-gray-600">{r.oldCost.toFixed(4)}</td>
                          <td className="px-3 py-2 font-mono font-medium text-gray-800">{r.newCost.toFixed(4)}</td>
                          <td className={`px-3 py-2 font-mono font-medium ${r.costInc>0?'text-red-500':'text-green-600'}`}>{r.costInc>0?'+':''}{r.costInc.toFixed(5)}</td>
                          <td className="px-3 py-2 font-mono text-gray-500">{r.sp>0?r.sp.toFixed(4):'—'}</td>
                          <td className="px-3 py-2">{r.sp>0?<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${mc(r.oldM)}`}>{r.oldM.toFixed(1)}%</span>:'—'}</td>
                          <td className="px-3 py-2">
                            {r.sp>0?(
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${mc(r.newM)}`}>{r.newM.toFixed(1)}%</span>
                                {r.newM!==r.oldM&&<span className={`text-xs ${r.newM>r.oldM?'text-green-500':'text-red-500'}`}>{r.newM>r.oldM?'▲':'▼'}{Math.abs(r.newM-r.oldM).toFixed(1)}pp</span>}
                              </div>
                            ):'—'}
                          </td>
                          <td className={`px-3 py-2 font-mono font-medium ${r.impact>0?'text-red-500':r.impact<0?'text-green-600':'text-gray-300'}`}>
                            {r.sold>0?(r.impact>0?'+':'')+r.impact.toFixed(3):<span className="text-gray-300">Load meal data</span>}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-800 text-white font-semibold sticky bottom-0">
                        <td className="px-3 py-2.5">TOTAL</td>
                        <td className="px-3 py-2.5 font-mono">{recResults.reduce((s,r)=>s+r.sold,0).toFixed(0)}</td>
                        <td colSpan={6} className="px-3 py-2.5"/>
                        <td className={`px-3 py-2.5 font-mono ${totMonthly>0?'text-red-300':'text-green-300'}`}>{totMonthly>0?'+':''}KWD {totMonthly.toFixed(3)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ):(
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm text-sm text-gray-400">
              The selected items are not used in any recipe — try different items
            </div>
          )}
        </div>
      )}

      {simItems.length===0&&(
        <div className="bg-white border border-gray-200 rounded-xl p-14 text-center shadow-sm">
          <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <p className="font-medium text-gray-700">Search and add raw materials above</p>
          <p className="text-sm text-gray-400 mt-1">Then set new prices to see the before/after impact</p>
        </div>
      )}
    </div>
  )
}
