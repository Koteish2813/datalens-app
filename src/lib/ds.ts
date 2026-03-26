import type { CSSProperties } from 'react'

// DataLens Design System — shared tokens and helpers

export const C = {
  bg:      '#0f1117',
  surface: '#161b27',
  card:    '#1a2035',
  border:  '#252d40',
  text:    '#f1f5f9',
  muted:   '#8892a4',
  dim:     '#4a5568',
  accent:  '#4f8ef7',
  accentG: 'rgba(79,142,247,0.12)',
  green:   '#22c55e',
  amber:   '#f59e0b',
  red:     '#ef4444',
  purple:  '#a78bfa',
  pink:    '#f472b6',
}

export const card = {
  background: C.card,
  borderRadius: 14,
  border: `1px solid ${C.border}`,
  overflow: 'hidden' as const,
}

export const cardPad = {
  ...card,
  padding: 20,
}

export const inputStyle = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.text,
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
} as CSSProperties

export const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
} as CSSProperties

export const btnPrimary = {
  background: C.accent,
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
} as CSSProperties

export const btnGhost = {
  background: 'transparent',
  color: C.muted,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
} as CSSProperties

export const btnDanger = {
  background: 'transparent',
  color: C.red,
  border: `1px solid rgba(239,68,68,0.3)`,
  borderRadius: 8,
  padding: '6px 12px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
} as CSSProperties

export const label = {
  display: 'block',
  fontSize: 9,
  fontWeight: 700,
  color: C.dim,
  letterSpacing: '0.08em',
  marginBottom: 6,
} as CSSProperties

export const sectionTitle = {
  fontSize: 9,
  fontWeight: 800,
  color: C.dim,
  letterSpacing: '0.12em',
} as CSSProperties

export const tableHeader = {
  padding: '8px 14px',
  color: C.dim,
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: '0.07em',
  textAlign: 'left' as const,
  whiteSpace: 'nowrap' as const,
  background: `rgba(37,45,64,0.4)`,
}

export const tableCell = {
  padding: '9px 14px',
  fontSize: 11,
  borderTop: `1px solid rgba(37,45,64,0.5)`,
  color: C.muted,
}

export const badge = (color: string) => ({
  fontSize: 10,
  fontWeight: 700,
  background: color + '20',
  color,
  padding: '3px 10px',
  borderRadius: 20,
  display: 'inline-block',
})

export const fmt = (n: number, d = 2) =>
  Number(n || 0).toLocaleString('en', { minimumFractionDigits: d, maximumFractionDigits: d })

export const TYPE_COLORS: Record<string, string> = {
  hourly_sales:   '#4f8ef7',
  delivery_sales: '#a78bfa',
  meal_count:     '#22c55e',
  menu_mix:       '#f59e0b',
  inventory:      '#ef4444',
}

export const TYPE_LABELS: Record<string, string> = {
  hourly_sales:   'Hourly Sales',
  delivery_sales: 'Delivery Sales',
  meal_count:     'Meal Count',
  menu_mix:       'Menu Mix',
  inventory:      'Inventory',
}

export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
