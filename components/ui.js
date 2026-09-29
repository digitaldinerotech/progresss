import { useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'

// Komponen UI kongsi untuk semua halaman

export const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-slate-100'

export const rm = n => 'RM ' + Number(n || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const num = (n, d = 0) => Number(n || 0).toLocaleString('ms-MY', { maximumFractionDigits: d })
export const fmtDate = d => (d ? new Date(d).toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
export const today = () => new Date().toISOString().slice(0, 10)

export const JOB_STATUS = {
  draft: ['Draf', 'bg-slate-100 text-slate-700'],
  awaiting_deposit: ['Tunggu deposit', 'bg-amber-100 text-amber-800'],
  confirmed: ['Disahkan', 'bg-blue-100 text-blue-800'],
  scheduled: ['Dijadualkan', 'bg-indigo-100 text-indigo-800'],
  in_production: ['Dalam pengeluaran', 'bg-violet-100 text-violet-800'],
  qc: ['QC', 'bg-cyan-100 text-cyan-800'],
  ready: ['Siap', 'bg-emerald-100 text-emerald-800'],
  delivered: ['Dihantar', 'bg-teal-100 text-teal-800'],
  completed: ['Selesai', 'bg-green-100 text-green-800'],
  cancelled: ['Batal', 'bg-red-100 text-red-700'],
}

export const BATCH_STAGES = ['planned', 'material_issued', 'processing', 'forming', 'packing', 'qc', 'released', 'rejected']
export const BATCH_STAGE = {
  planned: ['Dirancang', 'bg-slate-100 text-slate-700'],
  material_issued: ['Bahan dikeluarkan', 'bg-amber-100 text-amber-800'],
  processing: ['Proses / campur', 'bg-orange-100 text-orange-800'],
  forming: ['Tablet / isi', 'bg-violet-100 text-violet-800'],
  packing: ['Packing', 'bg-indigo-100 text-indigo-800'],
  qc: ['QC', 'bg-cyan-100 text-cyan-800'],
  released: ['Lulus', 'bg-green-100 text-green-800'],
  rejected: ['Ditolak', 'bg-red-100 text-red-700'],
}

export const LOT_STATUS = {
  quarantine: ['Kuarantin', 'bg-amber-100 text-amber-800'],
  released: ['Lulus', 'bg-green-100 text-green-800'],
  rejected: ['Ditolak', 'bg-red-100 text-red-700'],
  expired: ['Luput', 'bg-red-100 text-red-700'],
  depleted: ['Habis', 'bg-slate-100 text-slate-600'],
}

export const INVOICE_STATUS = {
  draft: ['Draf', 'bg-slate-100 text-slate-700'],
  issued: ['Belum bayar', 'bg-amber-100 text-amber-800'],
  partially_paid: ['Bayar separa', 'bg-blue-100 text-blue-800'],
  paid: ['Dibayar', 'bg-green-100 text-green-800'],
  void: ['Batal', 'bg-red-100 text-red-700'],
}

export const PRODUCT_FORM = {
  tablet: 'Tablet', capsule: 'Kapsul', softgel: 'Softgel',
  drink_liquid: 'Minuman (cecair)', drink_powder: 'Minuman (serbuk)', other: 'Lain-lain',
}

export const MATERIAL_CATEGORY = {
  active: 'Bahan aktif', excipient: 'Eksipien', flavour: 'Perisa', packaging: 'Pembungkusan', label: 'Label', other: 'Lain-lain',
}

export function Badge({ map, value }) {
  const [label, cls] = map[value] || [value, 'bg-slate-100 text-slate-700']
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-brand">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

export function Button({ variant = 'primary', loading, className = '', children, ...props }) {
  const styles = {
    primary: 'bg-brand text-white hover:bg-brand-light',
    accent: 'bg-accent text-brand hover:brightness-95',
    outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-slate-600 hover:bg-slate-100',
  }
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  )
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

export function Modal({ open, title, onClose, children, wide }) {
  useEffect(() => {
    if (!open) return
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="font-semibold text-brand">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Table({ head, children, empty, colSpan }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{head.map((h, i) => <th key={i} className={`px-4 py-2 font-medium ${h.right ? 'text-right' : ''}`}>{h.label ?? h}</th>)}</tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-slate-100">
          {children}
          {empty && (
            <tr><td colSpan={colSpan || head.length} className="px-4 py-8 text-center text-slate-400">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
            value === key ? 'border-accent text-brand' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function Loading() {
  return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-brand" /></div>
}

export function ErrorBox({ error }) {
  if (!error) return null
  return <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
}
