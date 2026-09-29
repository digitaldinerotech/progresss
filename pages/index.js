import { useEffect, useState } from 'react'
import Head from 'next/head'
import { ClipboardList, Clock, Wallet, AlertTriangle, Loader2 } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const STATUS_LABEL = {
  draft: 'Draf', awaiting_deposit: 'Tunggu deposit', confirmed: 'Disahkan', scheduled: 'Dijadualkan',
  in_production: 'Dalam pengeluaran', qc: 'QC', ready: 'Siap', delivered: 'Dihantar', completed: 'Selesai', cancelled: 'Batal',
}
const ACTIVE = ['awaiting_deposit', 'confirmed', 'scheduled', 'in_production', 'qc', 'ready']
const rm = n => 'RM ' + Number(n || 0).toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = d => (d ? new Date(d).toLocaleDateString('ms-MY', { day: '2-digit', month: 'short' }) : '—')

export default function Dashboard() {
  const [jobs, setJobs] = useState([])
  const [stock, setStock] = useState([])
  const [aging, setAging] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('v_job_order_progress').select('*').in('status', ACTIVE).order('promised_date', { ascending: true, nullsFirst: false }),
      supabase.from('v_raw_material_stock').select('*').eq('below_reorder', true).order('name'),
      supabase.from('v_receivables_aging').select('*').order('outstanding', { ascending: false }),
    ]).then(([j, s, a]) => {
      setJobs(j.data || [])
      setStock(s.data || [])
      setAging(a.data || [])
      setLoading(false)
    })
  }, [])

  const outstanding = aging.reduce((t, r) => t + Number(r.outstanding || 0), 0)
  const kpis = [
    { label: 'Order aktif', value: jobs.length, icon: ClipboardList },
    { label: 'Tunggu deposit', value: jobs.filter(j => j.status === 'awaiting_deposit').length, icon: Clock },
    { label: 'Lewat', value: jobs.filter(j => j.is_late).length, icon: AlertTriangle, warn: true },
    { label: 'Tertunggak', value: rm(outstanding), icon: Wallet },
  ]

  return (
    <Layout>
      <Head><title>Dashboard · Progresss</title></Head>
      <h1 className="text-2xl font-bold text-brand mb-6">Dashboard</h1>

      {loading ? (
        <Loader2 className="animate-spin text-brand" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map(({ label, value, icon: Icon, warn }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Icon size={16} className={warn && value ? 'text-red-500' : 'text-accent'} /> {label}
                </div>
                <div className={`mt-1 text-2xl font-bold ${warn && value ? 'text-red-600' : 'text-brand'}`}>{value}</div>
              </div>
            ))}
          </div>

          <section className="bg-white rounded-xl border border-slate-200">
            <h2 className="px-4 py-3 font-semibold border-b border-slate-200">Progress job order</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2">JO</th><th className="px-4 py-2">Client</th><th className="px-4 py-2">Produk</th>
                    <th className="px-4 py-2 text-right">Kuantiti</th><th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 w-48">Progress</th><th className="px-4 py-2">Janji siap</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Tiada order aktif</td></tr>}
                  {jobs.map(j => (
                    <tr key={j.id} className="border-t border-slate-100">
                      <td className="px-4 py-2 font-mono">{j.jo_no}</td>
                      <td className="px-4 py-2">{j.client_name}</td>
                      <td className="px-4 py-2">{j.product_name}</td>
                      <td className="px-4 py-2 text-right">{Number(j.quantity).toLocaleString()}</td>
                      <td className="px-4 py-2">{STATUS_LABEL[j.status]}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-slate-100">
                            <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, j.percent_done)}%` }} />
                          </div>
                          <span className="text-xs text-slate-500 w-10 text-right">{Math.round(j.percent_done)}%</span>
                        </div>
                      </td>
                      <td className={`px-4 py-2 ${j.is_late ? 'text-red-600 font-medium' : ''}`}>{fmtDate(j.promised_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid lg:grid-cols-2 gap-6">
            <section className="bg-white rounded-xl border border-slate-200">
              <h2 className="px-4 py-3 font-semibold border-b border-slate-200">Bahan mentah bawah paras reorder</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {stock.length === 0 && <li className="px-4 py-6 text-center text-slate-400">Semua stok mencukupi</li>}
                {stock.map(s => (
                  <li key={s.id} className="px-4 py-2 flex justify-between">
                    <span>{s.name}</span>
                    <span className="text-red-600">{Number(s.available_qty).toLocaleString()} / {Number(s.reorder_level).toLocaleString()} {s.uom}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-white rounded-xl border border-slate-200">
              <h2 className="px-4 py-3 font-semibold border-b border-slate-200">Tunggakan client</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {aging.length === 0 && <li className="px-4 py-6 text-center text-slate-400">Tiada tunggakan</li>}
                {aging.map(a => (
                  <li key={a.client_id} className="px-4 py-2 flex justify-between">
                    <span>{a.client_name}</span>
                    <span>
                      {rm(a.outstanding)}
                      {Number(a.d90_plus) > 0 && <span className="ml-2 text-xs text-red-600">&gt;90 hari: {rm(a.d90_plus)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </Layout>
  )
}
