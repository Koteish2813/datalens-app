'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import * as XLSX from 'xlsx'

interface MasterItem {
  id?: number
  item_code: string
  item_name: string
  wh_sku: string
  storage: string
  wh_description: string
  unit: string
  category: string
  status: string
  price_per_cs: number
  qty_per_cs: number
  supplier: string
  correct_price: number
  notes: string
}

const EMPTY: MasterItem = {
  item_code: '', item_name: '', wh_sku: '', storage: '', wh_description: '',
  unit: '', category: '', status: 'Active', price_per_cs: 0, qty_per_cs: 0,
  supplier: '', correct_price: 0, notes: ''
}

const CATEGORIES = ['Food', 'Packaging', 'Cleaning', 'Operational', 'Stationary']
const STORAGES = ['CHILLED', 'FROZEN', 'DRY STORE', 'BUN STORAGE', 'PEPSI ROOM', 'CHEMICAL ROOM', 'Operation item']
const STATUSES = ['Active', 'Inactive']

const COLS = [
  { key:'item_code',    label:'Item Code',     w:110, type:'text' },
  { key:'item_name',    label:'Item Name',     w:220, type:'text' },
  { key:'category',     label:'Category',      w:100, type:'select', opts:CATEGORIES },
  { key:'storage',      label:'Storage',       w:120, type:'select', opts:STORAGES },
  { key:'unit',         label:'Unit',          w:80,  type:'text' },
  { key:'price_per_cs', label:'Price/Cs (KWD)', w:110, type:'number' },
  { key:'qty_per_cs',   label:'Qty/Cs',        w:80,  type:'number' },
  { key:'correct_price',label:'Unit Price',    w:90,  type:'number' },
  { key:'supplier',     label:'Supplier',      w:180, type:'text' },
  { key:'wh_sku',       label:'WH SKU',        w:100, type:'text' },
  { key:'status',       label:'Status',        w:80,  type:'select', opts:STATUSES },
  { key:'notes',        label:'Notes',         w:150, type:'text' },
]

export default function MasterClient() {
  const supabase = createClient()
  const [items, setItems] = useState<MasterItem[]>([])
  const [filtered, setFiltered] = useState<MasterItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [filterStorage, setFilterStorage] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<MasterItem>(EMPTY)
  const [addingNew, setAddingNew] = useState(false)
  const [newForm, setNewForm] = useState<MasterItem>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<MasterItem | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadItems() }, [])

  useEffect(() => {
    let f = [...items]
    if (search) f = f.filter(i => i.item_name.toLowerCase().includes(search.toLowerCase()) || i.item_code.includes(search) || i.supplier?.toLowerCase().includes(search.toLowerCase()))
    if (filterCat !== 'all') f = f.filter(i => i.category === filterCat)
    if (filterStorage !== 'all') f = f.filter(i => i.storage?.trim() === filterStorage)
    if (filterStatus !== 'all') f = f.filter(i => i.status?.toLowerCase() === filterStatus.toLowerCase())
    setFiltered(f)
  }, [items, search, filterCat, filterStorage, filterStatus])

  async function loadItems() {
    setLoading(true)
    const { data } = await supabase.from('master_items').select('*').order('item_code')
    setItems(data ?? [])
    setLoading(false)
  }

  // Import from Excel
  async function handleImport(file: File) {
    setImporting(true); setImportMsg('Reading file…')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
    setImportMsg(`Found ${rows.length} rows. Importing…`)

    const mapped: MasterItem[] = rows.map(r => ({
      item_code:     String(r['Item Code'] || '').trim(),
      item_name:     String(r['Item Name'] || '').trim(),
      wh_sku:        String(r['WH SKU'] || '').trim(),
      storage:       String(r['storage'] || '').trim(),
      wh_description:String(r['WH Description'] || '').trim(),
      unit:          String(r['Unit'] || '').trim(),
      category:      String(r['Category Name'] || '').trim(),
      status:        String(r['Status'] || 'Active').trim(),
      price_per_cs:  Number(r['Price/Cs.']) || 0,
      qty_per_cs:    Number(r['QTY /CS']) || 0,
      supplier:      String(r['Supplier'] || '').trim(),
      correct_price: Number(r['Correct Price']) || 0,
      notes: '',
    })).filter(r => r.item_code)

    // Upsert all rows
    const { error } = await supabase.from('master_items').upsert(mapped, { onConflict: 'item_code' })
    if (error) { setImportMsg(`Error: ${error.message}`); setImporting(false); return }
    setImportMsg(`✓ Imported ${mapped.length} items successfully!`)
    setTimeout(() => setImportMsg(''), 4000)
    setImporting(false)
    loadItems()
  }

  // Save edit
  async function saveEdit() {
    if (!editingId) return
    setSaving(true)
    const { error } = await supabase.from('master_items').update(editForm).eq('id', editingId)
    if (!error) {
      setItems(prev => prev.map(i => i.id === editingId ? { ...i, ...editForm } : i))
      setEditingId(null)
      showSuccess('Item updated successfully')
    }
    setSaving(false)
  }

  // Add new
  async function saveNew() {
    setSaving(true)
    const { data, error } = await supabase.from('master_items').insert(newForm).select().single()
    if (!error && data) {
      setItems(prev => [...prev, data])
      setAddingNew(false)
      setNewForm(EMPTY)
      showSuccess('Item added successfully')
    }
    setSaving(false)
  }

  // Delete
  async function deleteItem(item: MasterItem) {
    setDeleteConfirm(null)
    await supabase.from('master_items').delete().eq('id', item.id!)
    setItems(prev => prev.filter(i => i.id !== item.id))
    showSuccess('Item deleted')
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  // Export to Excel
  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(items.map(i => ({
      'Item Code': i.item_code, 'Item Name': i.item_name, 'WH SKU': i.wh_sku,
      'Storage': i.storage, 'WH Description': i.wh_description, 'Unit': i.unit,
      'Category': i.category, 'Status': i.status, 'Price/Cs (KWD)': i.price_per_cs,
      'Qty/Cs': i.qty_per_cs, 'Unit Price': i.correct_price, 'Supplier': i.supplier, 'Notes': i.notes
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Master Raw Items')
    XLSX.writeFile(wb, 'Master_Raw_Items.xlsx')
  }

  const catCount = (cat: string) => items.filter(i => i.category === cat).length

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Master Raw Items</h1>
        <p className="text-sm text-gray-500 mt-0.5">Central reference for all raw materials — used for cost calculations and reporting.</p>
      </div>

      {/* Success */}
      {successMsg && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">{successMsg}</div>}
      {importMsg && <div className={`border text-sm rounded-xl px-4 py-3 ${importMsg.startsWith('✓') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>{importMsg}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm sm:col-span-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Items</p>
          <p className="text-xl font-semibold font-mono text-gray-900">{items.length}</p>
        </div>
        {CATEGORIES.map(cat => (
          <div key={cat} className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{cat}</p>
            <p className="text-xl font-semibold font-mono text-gray-900">{catCount(cat)}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/></svg>
          <input type="text" placeholder="Search by name, code or supplier…" value={search} onChange={e=>setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
        </div>
        <select className="text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white" value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c=><option key={c}>{c}</option>)}
        </select>
        <select className="text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white" value={filterStorage} onChange={e=>setFilterStorage(e.target.value)}>
          <option value="all">All Storage</option>
          {STORAGES.map(s=><option key={s}>{s}</option>)}
        </select>
        <select className="text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          {STATUSES.map(s=><option key={s}>{s}</option>)}
        </select>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => { setAddingNew(true); setNewForm(EMPTY) }}
            className="flex items-center gap-2 text-sm bg-blue-700 hover:bg-blue-800 text-white font-medium px-3.5 py-2 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" viewBox="0 0 16 16"><line x1="8" y1="1" x2="8" y2="15"/><line x1="1" y1="8" x2="15" y2="8"/></svg>
            Add Item
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="flex items-center gap-2 text-sm border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-3.5 py-2 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><path d="M8 1v10M5 8l3-3 3 3M2 13h12"/></svg>
            Import Excel
          </button>
          <button onClick={exportExcel}
            className="flex items-center gap-2 text-sm border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-3.5 py-2 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 16 16"><path d="M8 1v10M5 8l3 3 3-3M2 13h12"/></svg>
            Export Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>e.target.files?.[0] && handleImport(e.target.files[0])}/>
        </div>
      </div>

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Delete this item?</h3>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 my-3 text-sm">
              <p className="font-medium text-red-800">{deleteConfirm.item_name}</p>
              <p className="text-red-600 text-xs mt-0.5">Code: {deleteConfirm.item_code}</p>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => deleteItem(deleteConfirm)} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Items</p>
          <span className="text-xs text-gray-400">{filtered.length} of {items.length}</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-400 text-sm">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin"/>Loading…
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-xs border-collapse" style={{minWidth:1400}}>
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {COLS.map(c => <th key={c.key} className="text-left px-3 py-2.5 font-medium text-gray-500 border-b border-gray-100 whitespace-nowrap" style={{minWidth:c.w}}>{c.label}</th>)}
                  <th className="px-3 py-2.5 font-medium text-gray-500 border-b border-gray-100 text-center" style={{minWidth:100}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* Add new row */}
                {addingNew && (
                  <tr className="bg-blue-50 border-b border-blue-100">
                    {COLS.map(c => (
                      <td key={c.key} className="px-2 py-1.5 border-b border-blue-100">
                        {c.type === 'select' ? (
                          <select className="w-full text-xs border border-blue-300 rounded px-1.5 py-1 bg-white"
                            value={(newForm as any)[c.key]} onChange={e => setNewForm(p=>({...p,[c.key]:e.target.value}))}>
                            <option value="">Select…</option>
                            {c.opts?.map(o=><option key={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input type={c.type} className="w-full text-xs border border-blue-300 rounded px-1.5 py-1"
                            value={(newForm as any)[c.key]} onChange={e => setNewForm(p=>({...p,[c.key]: c.type==='number' ? Number(e.target.value) : e.target.value}))}/>
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={saveNew} disabled={saving || !newForm.item_code || !newForm.item_name}
                          className="bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs px-2.5 py-1 rounded transition-colors">Save</button>
                        <button onClick={() => setAddingNew(false)} className="border border-gray-200 text-gray-500 text-xs px-2.5 py-1 rounded hover:bg-gray-50">Cancel</button>
                      </div>
                    </td>
                  </tr>
                )}
                {filtered.map(item => (
                  <tr key={item.id} className={`border-b border-gray-50 ${editingId === item.id ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                    {COLS.map(c => (
                      <td key={c.key} className="px-2 py-1.5 border-b border-gray-50">
                        {editingId === item.id ? (
                          c.type === 'select' ? (
                            <select className="w-full text-xs border border-amber-300 rounded px-1.5 py-1 bg-white"
                              value={(editForm as any)[c.key]} onChange={e => setEditForm(p=>({...p,[c.key]:e.target.value}))}>
                              {c.opts?.map(o=><option key={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input type={c.type} className="w-full text-xs border border-amber-300 rounded px-1.5 py-1"
                              value={(editForm as any)[c.key]} onChange={e => setEditForm(p=>({...p,[c.key]: c.type==='number' ? Number(e.target.value) : e.target.value}))}/>
                          )
                        ) : (
                          <span className={`${c.key==='status' ? (item.status?.toLowerCase()==='active' ? 'text-green-600 font-medium' : 'text-red-500') : 'text-gray-700'}`}>
                            {c.type === 'number' ? (Number((item as any)[c.key])||0).toFixed(c.key==='qty_per_cs'?0:4) : String((item as any)[c.key]||'—')}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center">
                      {editingId === item.id ? (
                        <div className="flex gap-1 justify-center">
                          <button onClick={saveEdit} disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs px-2.5 py-1 rounded">Save</button>
                          <button onClick={() => setEditingId(null)} className="border border-gray-200 text-gray-500 text-xs px-2.5 py-1 rounded hover:bg-gray-50">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => { setEditingId(item.id!); setEditForm({...item}) }}
                            className="border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs px-2.5 py-1 rounded transition-colors">Edit</button>
                          <button onClick={() => setDeleteConfirm(item)}
                            className="border border-red-200 text-red-500 hover:bg-red-50 text-xs px-2.5 py-1 rounded transition-colors">Del</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !addingNew && (
                  <tr><td colSpan={COLS.length+1} className="px-4 py-8 text-center text-sm text-gray-400">
                    {items.length === 0 ? 'No items yet. Import your Excel file or add items manually.' : 'No items match your filters.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
