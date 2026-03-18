'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { parseExcelFile, REPORT_LABELS, REPORT_TABLES, type ReportType } from '@/lib/excel-parser'

type UploadStatus = 'idle' | 'parsing' | 'uploading' | 'success' | 'error'

interface FileResult {
  name: string
  status: UploadStatus
  reportType?: ReportType
  restaurant?: string
  date?: string
  rows?: number
  error?: string
}

export default function UploadPage() {
  const supabase = createClient()
  const [files, setFiles] = useState<FileResult[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFiles(fileList: FileList) {
    const newFiles: FileResult[] = Array.from(fileList).map(f => ({ name: f.name, status: 'parsing' as UploadStatus }))
    setFiles(prev => [...newFiles, ...prev])

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      const idx = i

      try {
        const buffer = await file.arrayBuffer()
        const parsed = parseExcelFile(buffer, file.name)

        if (parsed.error) {
          setFiles(prev => prev.map((f, j) => j === idx ? { ...f, status: 'error', error: parsed.error } : f))
          continue
        }

        setFiles(prev => prev.map((f, j) => j === idx ? {
          ...f, status: 'uploading',
          reportType: parsed.reportType,
          restaurant: parsed.restaurantName,
          date: parsed.date,
          rows: parsed.rows.length
        } : f))

        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        const userId = user?.id

        // Add uploaded_by to each row
        const rowsWithUser = parsed.rows.map(r => ({ ...r, uploaded_by: userId }))

        // Insert in batches of 500
        const table = REPORT_TABLES[parsed.reportType]
        const batchSize = 500
        for (let b = 0; b < rowsWithUser.length; b += batchSize) {
          const batch = rowsWithUser.slice(b, b + batchSize)
          const { error } = await supabase.from(table).insert(batch)
          if (error) throw new Error(error.message)
        }

        // Log the upload
        await supabase.from('upload_log').insert({
          file_name: file.name,
          report_type: parsed.reportType,
          restaurant_name: parsed.restaurantName,
          date: parsed.date,
          rows_inserted: parsed.rows.length,
          uploaded_by: userId,
        })

        setFiles(prev => prev.map((f, j) => j === idx ? { ...f, status: 'success' } : f))
      } catch (e: any) {
        setFiles(prev => prev.map((f, j) => j === idx ? { ...f, status: 'error', error: e.message } : f))
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files)
  }

  const statusIcon = (s: UploadStatus) => ({
    idle:      <div className="w-4 h-4 rounded-full bg-gray-200"/>,
    parsing:   <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>,
    uploading: <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"/>,
    success:   <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center"><svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 10 10"><polyline points="1,5 4,8 9,2"/></svg></div>,
    error:     <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center"><span className="text-white text-xs font-bold">!</span></div>,
  }[s])

  const statusColor = (s: UploadStatus) => ({
    idle: 'bg-gray-50 border-gray-200',
    parsing: 'bg-blue-50 border-blue-200',
    uploading: 'bg-blue-50 border-blue-200',
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
  }[s])

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Upload Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload daily Excel reports — auto-detected and stored by restaurant and date.</p>
      </div>

      {/* Supported types */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(['hourly_sales','delivery_sales','meal_count','menu_mix','inventory'] as ReportType[]).map(t => (
          <div key={t} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-center">
            <p className="text-xs font-medium text-gray-700">{REPORT_LABELS[t]}</p>
          </div>
        ))}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'}`}
      >
        <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center">
          <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>
          </svg>
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-800">Drop Excel files here</p>
          <p className="text-sm text-gray-500 mt-1">or click to browse — supports multiple files at once</p>
        </div>
        <input ref={inputRef} type="file" multiple accept=".xlsx,.xls" className="hidden"
          onChange={e => e.target.files && processFiles(e.target.files)} />
      </div>

      {/* Results */}
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-gray-700">Upload Results</h2>
          {files.map((f, i) => (
            <div key={i} className={`border rounded-xl px-4 py-3 flex items-start gap-3 ${statusColor(f.status)}`}>
              <div className="mt-0.5 shrink-0">{statusIcon(f.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                  {f.reportType && (
                    <span className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full shrink-0">
                      {REPORT_LABELS[f.reportType]}
                    </span>
                  )}
                </div>
                {f.restaurant && (
                  <p className="text-xs text-gray-500 mt-0.5">{f.restaurant} · {f.date} · {f.rows} rows</p>
                )}
                {f.status === 'success' && <p className="text-xs text-green-600 mt-0.5">✓ Uploaded successfully</p>}
                {f.error && <p className="text-xs text-red-600 mt-0.5">{f.error}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
